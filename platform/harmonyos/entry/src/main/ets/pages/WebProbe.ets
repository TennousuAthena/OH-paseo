import { webview } from '@kit.ArkWeb';
import { hilog } from '@kit.PerformanceAnalysisKit';

const TAG = 'OHPaseoWebProbe';
const DOMAIN = 0x0002;

@Entry
@Component
struct WebProbe {
  controller: webview.WebviewController = new webview.WebviewController();

  build() {
    Column() {
      Web({ src: $rawfile('probe/index.html'), controller: this.controller })
        .domStorageAccess(true)
        .fileAccess(true)
        .javaScriptAccess(true)
        .onlineImageAccess(true)
        .mixedMode(MixedMode.All)
        .onConsole((event) => {
          hilog.info(DOMAIN, TAG, `console: ${event?.message?.getMessage?.() ?? ''}`);
          return false;
        })
    }
    .width('100%')
    .height('100%')
  }
}
