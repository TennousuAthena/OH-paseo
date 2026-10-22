import { router } from '@kit.ArkUI';
import nodeProbe from 'libentry.so';
import { hilog } from '@kit.PerformanceAnalysisKit';
import { common } from '@kit.AbilityKit';

const TAG = 'OHPaseoUI';
const DOMAIN = 0x0004;

interface ProbeStatus { state: number; error: string; exit: number }
interface NodeProbe {
  startNode(nativeLibDir: string, script?: string): number;
  stopNode(): number;
  status(): ProbeStatus;
}

const probe = nodeProbe as NodeProbe;

@Entry
@Component
struct Index {
  @State nodeStatus: string = 'idle';
  @State nodeError: string = '';

  build() {
    Column({ space: 16 }) {
      Text('OH-Paseo P0 probe')
        .fontSize(20)
        .fontWeight(FontWeight.Medium)
      Text('bundle: moe.kiwi.ohpaseo')
        .fontSize(14)
      Button('Open ArkWeb probe')
        .onClick(() => router.pushUrl({ url: 'pages/WebProbe' }))
      Button('Start embedded Node')
        .onClick(() => {
          try {
            const ctx = getContext(this) as common.UIAbilityContext;
            const libDir = ctx.applicationInfo.nativeLibraryPath;
            hilog.info(DOMAIN, TAG, `nativeLibraryPath=${libDir}`);
            const r = probe.startNode(libDir,
              `console.log('hello '+process.version+' '+process.platform+' '+process.arch);`
              + `const http=require('http');`
              + `http.createServer((q,s)=>s.end('ok '+process.version)).listen(4747,'127.0.0.1',()=>console.log('listening 4747'));`
              + `setInterval(()=>console.log('tick '+Date.now()),5000);`
            );
            this.nodeStatus = `start→${r}`;
            setTimeout(() => {
              const s = probe.status();
              this.nodeStatus = `state=${s.state} exit=${s.exit}`;
              this.nodeError = s.error;
            }, 1200);
          } catch (e) {
            this.nodeError = String(e);
            hilog.error(DOMAIN, TAG, `nodeProbe failed: ${JSON.stringify(e)}`);
          }
        })
      Button('Refresh status')
        .onClick(() => {
          const s = probe.status();
          this.nodeStatus = `state=${s.state} exit=${s.exit}`;
          this.nodeError = s.error;
        })
      Text(`node: ${this.nodeStatus}`)
        .fontSize(13)
      if (this.nodeError.length > 0) {
        Text(`err: ${this.nodeError}`)
          .fontSize(11)
          .fontColor('#f87171')
      }
    }
    .width('100%')
    .height('100%')
    .justifyContent(FlexAlign.Center)
  }
}
