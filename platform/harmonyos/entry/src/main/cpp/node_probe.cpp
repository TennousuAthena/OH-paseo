// P0.3 probe: embed libnode.so and run node::Start on a dedicated pthread.
// fork+execv is blocked by SELinux (only HAP-packaged libs can be exec'd and
// execve of *any* standalone binary — even from app-private dirs — returns
// EACCES/EPERM). The only viable route is in-process Node.
//
// Known constraints (from earlier attempts):
//  * libuv's io_uring dlsym probes crash inside musl __dlvsym → solved by
//    exporting stub io_uring_* symbols that return -ENOSYS.
//  * node::Start can only be invoked once per process (V8 init is global).
//  * V8 signal handlers can conflict with musl/ACE — disable via argv flag.

#include "napi/native_api.h"
#include <hilog/log.h>
#include <unistd.h>
#include <signal.h>
#include <sys/types.h>
#include <sys/stat.h>
#include <fcntl.h>
#include <string.h>
#include <stdlib.h>
#include <errno.h>
#include <stdarg.h>
#include <dlfcn.h>
#include <string>
#include <vector>
#include <atomic>
#include <pthread.h>

#undef LOG_DOMAIN
#undef LOG_TAG
#define LOG_DOMAIN 0xD003
#define LOG_TAG "OHPaseoNodeProbe"
#include <hilog/log.h>

// ---------------------------------------------------------------------------
// libuv io_uring stubs — musl's __dlvsym on some kernels crashes when the
// symbol isn't found. Provide stubs returning -ENOSYS so libuv's probe
// falls back to epoll.
// ---------------------------------------------------------------------------
extern "C" {
// io_uring syscalls aren't on HarmonyOS's allowlist — kernel would send
// SIGSYS. Returning an explicit error via errno lets libuv's probe fall
// through to epoll. Log which one got hit so we can attribute crashes.
int io_uring_setup(unsigned entries, void* p) { (void)entries; (void)p; OH_LOG_INFO(LOG_APP, "io_uring_setup stub"); errno = ENOMEM; return -1; }
int io_uring_enter(int fd, unsigned to_submit, unsigned min_complete, unsigned flags, const void* sig) {
    (void)fd; (void)to_submit; (void)min_complete; (void)flags; (void)sig; OH_LOG_INFO(LOG_APP, "io_uring_enter stub"); errno = ENOMEM; return -1;
}
int io_uring_register(int fd, unsigned opcode, const void* arg, unsigned nr_args) {
    (void)fd; (void)opcode; (void)arg; (void)nr_args; OH_LOG_INFO(LOG_APP, "io_uring_register stub"); errno = ENOMEM; return -1;
}
}

// ---------------------------------------------------------------------------
// SIGSYS swallow. HarmonyOS's seccomp returns SIGSYS for syscalls not on
// the allowlist (unshare, perf_event_open, memfd_secret, some io_uring ops,
// etc.). V8/libuv/node happily probe for some of these during init; without
// a handler the process dies on the first disallowed syscall.
//
// The handler must be installed BEFORE libnode's constructors run — so we
// register it from this file's own constructor (this .so loads before the
// Node thread starts).
// ---------------------------------------------------------------------------
static void sigsys_handler(int sig, siginfo_t* info, void* uctx) {
    (void)sig; (void)info;
#if defined(__aarch64__)
    ucontext_t* uc = (ucontext_t*)uctx;
    // x8 = syscall number, x0 = return value. Set retval to -ENOSYS and skip
    // the svc instruction so the probe sees a normal -1 return.
    uc->uc_mcontext.regs[0] = -38;
    uc->uc_mcontext.pc += 4;
#elif defined(__arm__)
    ucontext_t* uc = (ucontext_t*)uctx;
    uc->uc_mcontext.arm_r0 = -38;
    uc->uc_mcontext.arm_pc += 4;
#endif
}

__attribute__((constructor)) static void install_sigsys_handler() {
    struct sigaction sa{};
    sa.sa_sigaction = sigsys_handler;
    sigemptyset(&sa.sa_mask);
    sa.sa_flags = SA_SIGINFO | SA_NODEFER;
    sigaction(SIGSYS, &sa, nullptr);
}

// ---------------------------------------------------------------------------
// node::Start plumbing
// ---------------------------------------------------------------------------
typedef int (*node_start_fn)(int argc, char** argv);

static std::atomic<int> g_nodeState{0};  // 0=idle 1=starting 2=running 3=exited -1=error
static std::atomic<int> g_nodeExit{-1};
static char g_lastError[512] = {0};
static std::string g_script;
static std::string g_nativeLibDir;
static pthread_t g_nodeThread;

static void setError(const char* fmt, ...) {
    va_list ap; va_start(ap, fmt);
    vsnprintf(g_lastError, sizeof(g_lastError), fmt, ap);
    va_end(ap);
}

// Wrap writes to the fd-passed-by-arg as node stdout; simpler to just use a
// pipe we control. node writes stdout via stdio → we redirect fds 1,2 into
// our pipe before invoking node::Start.
static int g_pipeW = -1;

static void* node_thread_main(void*) {
    g_nodeState = 1;
    std::string soPath = g_nativeLibDir + "/libnode.so.137";
    OH_LOG_INFO(LOG_APP, "dlopen %{public}s", soPath.c_str());
    void* h = dlopen(soPath.c_str(), RTLD_NOW | RTLD_GLOBAL);
    if (!h) {
        setError("dlopen %s: %s", soPath.c_str(), dlerror());
        g_nodeState = -1;
        return nullptr;
    }
    OH_LOG_INFO(LOG_APP, "dlopen ok h=%{public}p", h);

    node_start_fn node_start = (node_start_fn)dlsym(h, "node_start");
    if (!node_start) {
        // try mangled name used by node 24+
        node_start = (node_start_fn)dlsym(h, "_ZN4node5StartEiPPc");
    }
    if (!node_start) {
        setError("dlsym node_start: %s", dlerror());
        g_nodeState = -1;
        return nullptr;
    }
    OH_LOG_INFO(LOG_APP, "node_start=%{public}p", (void*)node_start);

    // Redirect process stdout/stderr into our pipe *before* node::Start
    // (writes by JS console.log use fd 1).
    int pfd[2];
    if (pipe(pfd) == 0) {
        fcntl(pfd[0], F_SETFL, O_NONBLOCK);
        // Save originals so we can restore if needed.
        dup2(pfd[1], STDOUT_FILENO);
        dup2(pfd[1], STDERR_FILENO);
        g_pipeW = pfd[0]; // we read from here in the pump
    }

    // argv must NOT count the trailing nullptr.
    // --no-node-snapshot avoids needing a snapshot blob; --max-old-space-size
    // limits heap so we don't OOM the app. --disable-proto=throw removes
    // some insecure paths.
    std::vector<std::string> args = {
        "node",
        "--no-node-snapshot",
        "--max-old-space-size=512",
        "--no-warnings",
        "-e",
        g_script,
    };
    std::vector<char*> argv;
    for (auto& s : args) argv.push_back(const_cast<char*>(s.c_str()));
    argv.push_back(nullptr);
    int argc = (int)argv.size() - 1;

    OH_LOG_INFO(LOG_APP, "node::Start argc=%{public}d", argc);
    g_nodeState = 2;
    int rc = node_start(argc, argv.data());
    g_nodeExit = rc;
    g_nodeState = 3;
    OH_LOG_INFO(LOG_APP, "node::Start returned %{public}d", rc);
    return nullptr;
}

// Pump thread: drain the node's stdout pipe and emit to hilog.
static std::atomic<bool> g_pumpRunning{false};
static pthread_t g_pumpThread;

static void* stdout_pump(void*) {
    char buf[4096];
    std::string line;
    while (g_pumpRunning.load()) {
        if (g_pipeW < 0) { usleep(50*1000); continue; }
        ssize_t n = read(g_pipeW, buf, sizeof(buf));
        if (n <= 0) { usleep(50*1000); continue; }
        line.append(buf, n);
        size_t pos;
        while ((pos = line.find('\n')) != std::string::npos) {
            OH_LOG_INFO(LOG_APP, "[node] %{public}s", line.substr(0, pos).c_str());
            line.erase(0, pos + 1);
        }
    }
    return nullptr;
}

napi_value StartNodeProbe(napi_env env, napi_callback_info info) {
    size_t argc = 2;
    napi_value argv[2];
    napi_get_cb_info(env, info, &argc, argv, nullptr, nullptr);
    if (argc < 1) {
        napi_value r; napi_create_int32(env, -1, &r); return r;
    }
    auto getStr = [&](napi_value v, std::string& out) {
        size_t n = 0;
        napi_get_value_string_utf8(env, v, nullptr, 0, &n);
        std::vector<char> buf(n + 1);
        napi_get_value_string_utf8(env, v, buf.data(), buf.size(), &n);
        out.assign(buf.data(), n);
    };
    getStr(argv[0], g_nativeLibDir);  // first arg = nativeLibraryPath
    if (argc >= 2) getStr(argv[1], g_script);
    else g_script =
        "console.log('hello '+process.version+' '+process.platform+' '+process.arch);"
        "const http=require('http');"
        "http.createServer((q,s)=>s.end('ok '+process.version))"
        ".listen(4747,'127.0.0.1',()=>console.log('listening'));";

    if (g_nodeState.load() == 1 || g_nodeState.load() == 2) {
        napi_value r; napi_create_int32(env, -2, &r); return r;
    }
    g_nodeState = 0;
    g_nodeExit = -1;

    if (!g_pumpRunning.load()) {
        g_pumpRunning = true;
        pthread_create(&g_pumpThread, nullptr, stdout_pump, nullptr);
        pthread_detach(g_pumpThread);
    }
    int r = pthread_create(&g_nodeThread, nullptr, node_thread_main, nullptr);
    if (r != 0) {
        setError("pthread_create: %s", strerror(r));
        napi_value v; napi_create_int32(env, -3, &v); return v;
    }
    pthread_detach(g_nodeThread);
    OH_LOG_INFO(LOG_APP, "spawned node thread");
    napi_value v; napi_create_int32(env, 0, &v); return v;
}

napi_value StopNodeProbe(napi_env env, napi_callback_info) {
    // Can't reliably kill node once started — node::Start installs handlers.
    // Best we can do is surface the state.
    napi_value r; napi_create_int32(env, g_nodeState.load(), &r); return r;
}

napi_value ProbeStatus(napi_env env, napi_callback_info) {
    napi_value obj; napi_create_object(env, &obj);
    napi_value s; napi_create_int32(env, g_nodeState.load(), &s);
    napi_set_named_property(env, obj, "state", s);
    napi_value e; napi_create_string_utf8(env, g_lastError, NAPI_AUTO_LENGTH, &e);
    napi_set_named_property(env, obj, "error", e);
    napi_value x; napi_create_int32(env, g_nodeExit.load(), &x);
    napi_set_named_property(env, obj, "exit", x);
    return obj;
}
