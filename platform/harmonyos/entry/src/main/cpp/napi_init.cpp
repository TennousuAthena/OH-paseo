#include "napi/native_api.h"
#include <hilog/log.h>

extern napi_value StartNodeProbe(napi_env env, napi_callback_info info);
extern napi_value StopNodeProbe(napi_env env, napi_callback_info info);
extern napi_value ProbeStatus(napi_env env, napi_callback_info info);

EXTERN_C_START
static napi_value Init(napi_env env, napi_value exports) {
    napi_property_descriptor desc[] = {
        { "startNode", nullptr, StartNodeProbe, nullptr, nullptr, nullptr, napi_default, nullptr },
        { "stopNode", nullptr, StopNodeProbe, nullptr, nullptr, nullptr, napi_default, nullptr },
        { "status", nullptr, ProbeStatus, nullptr, nullptr, nullptr, napi_default, nullptr },
    };
    napi_define_properties(env, exports, sizeof(desc) / sizeof(desc[0]), desc);
    return exports;
}
EXTERN_C_END

static napi_module nodeProbeModule = {
    .nm_version = 1,
    .nm_flags = 0,
    .nm_filename = nullptr,
    .nm_register_func = Init,
    .nm_modname = "entry",
    .nm_priv = nullptr,
    .reserved = { 0 },
};

extern "C" __attribute__((constructor)) void RegisterNodeProbeModule(void) {
    napi_module_register(&nodeProbeModule);
}
