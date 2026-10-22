import { webview } from '@kit.ArkWeb';
import { hilog } from '@kit.PerformanceAnalysisKit';
import { common } from '@kit.AbilityKit';
import { url } from '@kit.ArkTS';
import { window, promptAction } from '@kit.ArkUI';
import { deviceInfo } from '@kit.BasicServicesKit';
import { scanBarcode, scanCore } from '@kit.ScanKit';
import { BusinessError } from '@kit.BasicServicesKit';

const DOMAIN = 0x0005;
const TAG = 'OHPaseoClient';

@Entry
@Component
struct Paseo {
  controller: webview.WebviewController = new webview.WebviewController();
  private loadTimer: number = -1;
  private barTimer: number = -1;
  private barColor: string = '';
  private barUpdatePending: boolean = false;
  private scanning: boolean = false;
  private backPending: boolean = false;
  private externalPending: boolean = false;
  private readonly scannerAvailable: boolean =
    (deviceInfo.deviceType === 'phone' || deviceInfo.deviceType === 'tablet') &&
    canIUse('SystemCapability.Multimedia.Scan.ScanBarcode');
  private readonly appUrl: string = 'paseo://app/';
  @State loadError: string = '';
  @State progress: number = 0;

  aboutToAppear(): void {
    const context = this.getUIContext().getHostContext() as common.UIAbilityContext;
    webview.WebviewController.setWebDebuggingAccess(context.applicationInfo.debug);
  }

  aboutToDisappear(): void {
    this.clearLoadTimer();
    this.stopSystemBarSync();
  }

  onPageShow(): void {
    this.startSystemBarSync();
  }

  onPageHide(): void {
    this.stopSystemBarSync();
  }

  onBackPress(): boolean {
    this.handleBack();
    return true;
  }

  private async handleBack(): Promise<void> {
    if (this.backPending) return;
    this.backPending = true;
    try {
      const handled = await this.controller.runJavaScript(
        `!window.dispatchEvent(new Event('paseo-system-back', { cancelable: true }))`);
      if (handled !== 'true' && this.controller.accessBackward()) this.controller.backward();
    } catch (_) {
      // Loading or an unavailable renderer must not turn Back into an app exit.
    } finally {
      this.backPending = false;
    }
  }

  private isInternalLink(target: string): boolean {
    try {
      const parsed = new url.URL(target);
      return parsed.protocol === 'paseo:' && parsed.host === 'app' &&
        parsed.username.length === 0 && parsed.password.length === 0;
    } catch (_) { return false; }
  }

  private confirmWebAction(event: OnConfirmEvent): boolean {
    // ArkWeb has no default confirm UI; ignoring it silently returns false.
    if (!this.isInternalLink(event.url)) {
      event.result.handleCancel();
      return true;
    }
    try {
      this.getUIContext().showAlertDialog({
        title: 'Paseo',
        message: event.message,
        primaryButton: {
          value: $r('app.string.dialog_cancel'),
          action: () => event.result.handleCancel()
        },
        secondaryButton: {
          value: $r('app.string.dialog_confirm'),
          action: () => event.result.handleConfirm()
        },
        cancel: () => event.result.handleCancel()
      });
    } catch (_) {
      event.result.handleCancel();
    }
    return true;
  }

  private interceptNavigation(request: WebResourceRequest): boolean {
    if (this.interceptScan(request)) return true;
    const target = request.getRequestUrl();
    if (this.isInternalLink(target)) return false;
    // Passive embedded previews stay in their frame; clicked links leave the app.
    if (!request.isMainFrame() && !request.isRequestGesture()) return false;
    this.openExternal(target);
    return true;
  }

  private async openExternal(target: string): Promise<void> {
    if (this.externalPending || !/^https?:\/\//i.test(target)) return;
    this.externalPending = true;
    try {
      const parsed = new url.URL(target);
      if (!parsed.hostname) return;
      const context = this.getUIContext().getHostContext() as common.UIAbilityContext;
      await context.startAbility({
        action: 'ohos.want.action.viewData',
        entities: ['entity.system.browsable'],
        uri: target
      });
    } catch (_) {
      promptAction.showToast({ message: '无法打开浏览器，请稍后重试。' });
    } finally {
      this.externalPending = false;
    }
  }

  private stopSystemBarSync(): void {
    if (this.barTimer !== -1) {
      clearInterval(this.barTimer);
      this.barTimer = -1;
    }
  }

  private startSystemBarSync(): void {
    if (this.barTimer === -1) {
      this.barTimer = setInterval(() => this.syncSystemBars(), 1000);
    }
    this.syncSystemBars();
  }

  private async syncSystemBars(): Promise<void> {
    if (this.barUpdatePending) {
      return;
    }
    this.barUpdatePending = true;
    try {
      // Read only the painted background; no native bridge is exposed to the page.
      // Polling also covers client-side theme changes without a document reload.
      const result = await this.controller.runJavaScript(`(() => {
        let e = document.elementFromPoint(innerWidth / 2, 1);
        while (e) {
          const c = getComputedStyle(e).backgroundColor.match(/[\\d.]+/g);
          if (c && (c.length < 4 || Number(c[3]) > 0.5)) {
            return Number(c[0]) * .299 + Number(c[1]) * .587 + Number(c[2]) * .114 < 150 ? 'dark' : 'light';
          }
          e = e.parentElement;
        }
        return 'light';
      })()`);
      const color = result.includes('dark') ? '#ffffff' : '#000000';
      if (color !== this.barColor) {
        const context = this.getUIContext().getHostContext() as common.UIAbilityContext;
        const mainWindow = await window.getLastWindow(context);
        await mainWindow.setWindowSystemBarProperties({
          statusBarContentColor: color,
          navigationBarContentColor: color
        });
        this.barColor = color;
      }
    } catch (_) {
      // The Web controller may not be attached during launch or navigation.
    } finally {
      this.barUpdatePending = false;
    }
  }

  private clearLoadTimer(): void {
    if (this.loadTimer !== -1) {
      clearTimeout(this.loadTimer);
      this.loadTimer = -1;
    }
  }

  private beginLoading(): void {
    this.clearLoadTimer();
    this.loadError = '';
    this.progress = 0;
    this.loadTimer = setTimeout(() => {
      this.loadError = '界面加载超时，请重试。';
    }, 30000);
  }

  private localResource(request: WebResourceRequest): WebResourceResponse | null {
    if (!request.getRequestUrl().startsWith('paseo://app/')) {
      return null;
    }
    const response = new WebResourceResponse();
    response.setResponseEncoding('utf-8');
    response.setResponseHeader([{ headerKey: 'Cache-Control', headerValue: 'no-cache' }]);
    try {
      const parsed = new url.URL(request.getRequestUrl());
      const path = decodeURIComponent(parsed.pathname).replace(/^\/+/, '');
      if (path.split('/').some((part: string) => part === '..') || path.includes('\\')) {
        throw new Error('Invalid resource path');
      }
      if (path === '__native/capabilities.js') {
        response.setResponseMimeType('text/javascript');
        response.setResponseData(`window.__PASEO_HARMONY_APP__ = true; window.__PASEO_HARMONY_SCAN__ = ${this.scannerAvailable};`);
        response.setResponseCode(200);
        response.setReasonMessage('OK');
        return response;
      }
      const context = this.getUIContext().getHostContext() as common.UIAbilityContext;
      // Expo's SPA routes resolve to index.html, while missing assets stay 404.
      const resource = path.length === 0 || !path.split('/').pop()?.includes('.') ? 'index.html' : path;
      const data = context.resourceManager.getRawFileContentSync('paseo/' + resource);
      let mime = 'application/octet-stream';
      if (resource.endsWith('.html')) mime = 'text/html';
      else if (resource.endsWith('.js')) mime = 'text/javascript';
      else if (resource.endsWith('.css')) mime = 'text/css';
      else if (resource.endsWith('.json')) mime = 'application/json';
      else if (resource.endsWith('.svg')) mime = 'image/svg+xml';
      else if (resource.endsWith('.png')) mime = 'image/png';
      else if (resource.endsWith('.woff2')) mime = 'font/woff2';
      else if (resource.endsWith('.ttf')) mime = 'font/ttf';
      else if (resource.endsWith('.wasm')) mime = 'application/wasm';
      response.setResponseMimeType(mime);
      response.setResponseData(data.buffer as ArrayBuffer);
      response.setResponseCode(200);
      response.setReasonMessage('OK');
    } catch (_) {
      response.setResponseMimeType('text/plain');
      response.setResponseData('Not found');
      response.setResponseCode(404);
      response.setReasonMessage('Not Found');
    }
    return response;
  }

  private interceptScan(request: WebResourceRequest): boolean {
    const target = request.getRequestUrl();
    if (!target.startsWith('paseo://app/__native/scan')) return false;
    // Only the bundled top-level scan screen can request this narrow capability.
    const match = target.match(/^paseo:\/\/app\/__native\/scan\?id=([a-f0-9-]{36})$/);
    if (request.isMainFrame() && match && this.scannerAvailable && !this.scanning) {
      setTimeout(() => this.scanQr(match[1]), 0);
    }
    return true;
  }

  private async scanQr(id: string): Promise<void> {
    this.scanning = true;
    let value = '';
    let error = '';
    let cancelled = false;
    try {
      const trusted = await this.controller.runJavaScript(
        `location.protocol === 'paseo:' && location.host === 'app' && location.pathname === '/pair-scan'`);
      if (trusted !== 'true') return;
      const context = this.getUIContext().getHostContext() as common.UIAbilityContext;
      const result = await scanBarcode.startScanForResult(context, {
        scanTypes: [scanCore.ScanType.QR_CODE], enableMultiMode: false, enableAlbum: true
      });
      value = result.originalValue;
    } catch (cause) {
      const code = (cause as BusinessError).code;
      cancelled = code === 1000500002;
      if (!cancelled) error = `无法启动扫码，请重试（${code}）。`;
    } finally {
      this.scanning = false;
    }
    // Never expose pairing credentials to a different page or write them to logs.
    const payload = JSON.stringify({ id, value, error, cancelled });
    try {
      await this.controller.runJavaScript(`if (location.protocol === 'paseo:' && location.host === 'app' &&
        location.pathname === '/pair-scan') {
          window.dispatchEvent(new CustomEvent('paseo-scan-result', {detail:${payload}}));
        }`);
    } catch (_) { /* The document may have closed while the scanner was open. */ }
  }

  private retry(): void {
    this.beginLoading();
    try {
      this.controller.loadUrl(this.appUrl);
    } catch (_) {
      this.clearLoadTimer();
      this.loadError = '页面尚未就绪，请稍后重试。';
    }
  }

  build() {
    Column() {
      if (this.loadError.length > 0) {
        Row({ space: 12 }) {
          Text(this.loadError).fontSize(14).fontColor('#9f1239').layoutWeight(1)
          Button('重试').onClick(() => this.retry())
        }.width('100%').padding(16).backgroundColor('#fff1f2')
      }

      Column() {
        if (this.progress < 100 && this.loadError.length === 0) {
          Progress({ value: this.progress, total: 100, type: ProgressType.Linear }).width('100%')
        }
        Web({ src: this.appUrl, controller: this.controller })
          .layoutWeight(1).width('100%')
          // Let the page paint beneath the system bars. ArkWeb exposes their
          // insets through CSS env(), which Paseo already uses for controls.
          .expandSafeArea([SafeAreaType.SYSTEM], [SafeAreaEdge.TOP, SafeAreaEdge.BOTTOM])
          // Expose the system preference to matchMedia; Paseo owns its palette.
          .darkMode(WebDarkMode.Auto)
          .forceDarkAccess(false)
          .domStorageAccess(true)
          .javaScriptAccess(true)
          .fileAccess(false)
          // User-added LAN hosts can use ws://; the application shell stays bundled.
          .mixedMode(MixedMode.All)
          .multiWindowAccess(true)
          .onConfirm((event) => this.confirmWebAction(event))
          .onWindowNew((event) => {
            // Reject the child WebView explicitly so window.open cannot hang ArkWeb.
            event.handler.setWebController(null!);
            if (this.isInternalLink(event.targetUrl)) this.controller.loadUrl(event.targetUrl);
            else this.openExternal(event.targetUrl);
          })
          .onLoadIntercept((event) => this.interceptNavigation(event.data))
          .onOverrideUrlLoading((request) => this.interceptNavigation(request))
          .onInterceptRequest((event) => this.localResource(event.request) as WebResourceResponse)
          .onPageBegin(() => this.beginLoading())
          .onProgressChange((event) => { this.progress = event?.newProgress ?? 0; })
          .onPageEnd(() => {
            this.clearLoadTimer();
            this.startSystemBarSync();
            hilog.info(DOMAIN, TAG, 'Web page load completed');
          })
          .onErrorReceive((event) => {
            if (event?.request.isMainFrame()) {
              this.clearLoadTimer();
              this.loadError = `无法加载 Paseo（${event.error.getErrorCode()}）。请重试或重新安装应用。`;
              hilog.warn(DOMAIN, TAG, 'Main frame load failed: %{public}d', event.error.getErrorCode());
            }
          })
          .onHttpErrorReceive((event) => {
            if (event?.request.isMainFrame()) {
              this.clearLoadTimer();
              this.loadError = `服务返回 HTTP ${event.response.getResponseCode()}，请重新加载界面。`;
            }
          })
          .onRenderExited(() => {
            this.clearLoadTimer();
            this.loadError = '网页进程已退出，请重新加载以恢复会话。';
          })
      }.layoutWeight(1).width('100%')
    }.width('100%').height('100%').backgroundColor('#ffffff')
  }
}
