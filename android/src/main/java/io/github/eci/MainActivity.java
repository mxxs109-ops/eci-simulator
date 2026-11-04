package io.github.eci;

import android.Manifest;
import android.app.Activity;
import android.content.Intent;
import android.content.pm.PackageManager;
import android.graphics.Color;
import android.net.Uri;
import android.os.Build;
import android.os.Bundle;
import android.view.View;
import android.view.WindowManager;
import android.webkit.PermissionRequest;
import android.webkit.ValueCallback;
import android.webkit.WebChromeClient;
import android.webkit.WebResourceRequest;
import android.webkit.WebResourceResponse;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.webkit.WebViewClient;

import java.io.InputStream;

/**
 * 整个 App 就是一个 WebView：
 * - 首页（扫码、已保存的电脑）是 assets 里的网页，用 https://app.local/ 这个假地址加载，这样网页里能用摄像头扫码
 * - 连上以后直接打开电脑上的游戏 http://局域网地址:7788/?t=连接码
 * - 返回键：游戏里先后退，退到头回首页
 */
public class MainActivity extends Activity {
    private static final String HOME = "https://app.local/index.html";
    private static final int REQ_CAMERA = 1, REQ_FILE = 2;
    private WebView web;
    private PermissionRequest pendingCam;
    private ValueCallback<Uri[]> pendingFile;

    @Override
    protected void onCreate(Bundle saved) {
        super.onCreate(saved);
        getWindow().addFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON);
        web = new WebView(this);
        web.setBackgroundColor(Color.parseColor("#1f1915"));
        setContentView(web);

        WebSettings s = web.getSettings();
        s.setJavaScriptEnabled(true);
        s.setDomStorageEnabled(true);
        s.setMediaPlaybackRequiresUserGesture(false);   // 配音要能自动播
        s.setMixedContentMode(WebSettings.MIXED_CONTENT_ALWAYS_ALLOW);
        s.setTextZoom(100);

        web.setWebViewClient(new WebViewClient() {
            @Override
            public WebResourceResponse shouldInterceptRequest(WebView v, WebResourceRequest req) {
                Uri u = req.getUrl();
                if (!"app.local".equals(u.getHost())) return null;
                String path = u.getPath() == null || u.getPath().equals("/") ? "index.html" : u.getPath().substring(1);
                try {
                    InputStream in = getAssets().open(path);
                    String type = path.endsWith(".js") ? "text/javascript" : path.endsWith(".png") ? "image/png" : "text/html";
                    return new WebResourceResponse(type, "utf-8", in);
                } catch (Exception e) {
                    return new WebResourceResponse("text/plain", "utf-8", 404, "Not Found", null, null);
                }
            }

            @Override
            public void onReceivedError(WebView v, WebResourceRequest req, android.webkit.WebResourceError err) {
                // 电脑上的游戏没开 / 不在同一个 Wi-Fi：回首页，告诉她怎么回事
                if (req.isForMainFrame() && !"app.local".equals(req.getUrl().getHost())) {
                    v.loadUrl(HOME + "#offline=" + Uri.encode(req.getUrl().toString()));
                }
            }
        });

        web.setWebChromeClient(new WebChromeClient() {
            @Override
            public void onPermissionRequest(PermissionRequest r) {
                // 首页扫码要摄像头
                if (Build.VERSION.SDK_INT >= 23 && checkSelfPermission(Manifest.permission.CAMERA) != PackageManager.PERMISSION_GRANTED) {
                    pendingCam = r;
                    requestPermissions(new String[]{Manifest.permission.CAMERA}, REQ_CAMERA);
                } else r.grant(r.getResources());
            }

            @Override
            public boolean onShowFileChooser(WebView v, ValueCallback<Uri[]> cb, FileChooserParams p) {
                // 聊天里发图片
                if (pendingFile != null) pendingFile.onReceiveValue(null);
                pendingFile = cb;
                try { startActivityForResult(p.createIntent(), REQ_FILE); } catch (Exception e) { pendingFile = null; return false; }
                return true;
            }
        });

        if (saved != null) web.restoreState(saved);
        else web.loadUrl(HOME);
    }

    @Override
    public void onRequestPermissionsResult(int code, String[] perms, int[] res) {
        if (code == REQ_CAMERA && pendingCam != null) {
            if (res.length > 0 && res[0] == PackageManager.PERMISSION_GRANTED) pendingCam.grant(pendingCam.getResources());
            else pendingCam.deny();
            pendingCam = null;
        }
    }

    @Override
    protected void onActivityResult(int code, int result, Intent data) {
        if (code == REQ_FILE && pendingFile != null) {
            pendingFile.onReceiveValue(WebChromeClient.FileChooserParams.parseResult(result, data));
            pendingFile = null;
        }
    }

    @Override
    public void onBackPressed() {
        String u = web.getUrl();
        if (web.canGoBack() && u != null && !u.startsWith(HOME)) web.goBack();
        else if (u != null && !u.startsWith(HOME)) web.loadUrl(HOME);
        else super.onBackPressed();
    }

    @Override
    protected void onSaveInstanceState(Bundle out) { super.onSaveInstanceState(out); web.saveState(out); }
}
