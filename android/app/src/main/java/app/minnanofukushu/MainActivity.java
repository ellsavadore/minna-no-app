package app.minnanofukushu;

import android.annotation.SuppressLint;
import android.app.Activity;
import android.content.Intent;
import android.net.Uri;
import android.os.Bundle;
import android.speech.tts.TextToSpeech;
import android.webkit.JavascriptInterface;
import android.webkit.WebChromeClient;
import android.webkit.WebResourceRequest;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.webkit.WebViewClient;

import java.util.Locale;

public class MainActivity extends Activity {
    static final String HOME = "https://minna-no-fukushu.vercel.app/";
    static final String HOST = "minna-no-fukushu.vercel.app";
    private WebView web;
    private TextToSpeech tts;
    private boolean ttsReady = false;

    /** Japanese voice for the web app (Android WebView has no speechSynthesis). */
    public class Tts {
        @JavascriptInterface public void speak(String text) {
            if (tts == null || !ttsReady || text == null) return;
            tts.speak(text, TextToSpeech.QUEUE_FLUSH, null, "mna");
        }
        @JavascriptInterface public void stop() { if (tts != null) tts.stop(); }
    }

    @SuppressLint({"SetJavaScriptEnabled", "AddJavascriptInterface"})
    @Override protected void onCreate(Bundle saved) {
        super.onCreate(saved);
        tts = new TextToSpeech(this, status -> {
            if (status == TextToSpeech.SUCCESS) {
                tts.setLanguage(Locale.JAPAN);
                tts.setSpeechRate(0.9f);
                ttsReady = true;
            }
        });
        web = new WebView(this);
        WebSettings s = web.getSettings();
        s.setJavaScriptEnabled(true);
        s.setDomStorageEnabled(true);
        s.setDatabaseEnabled(true);
        s.setMediaPlaybackRequiresUserGesture(false);
        s.setTextZoom(100);
        s.setUserAgentString(s.getUserAgentString() + " MinnaFukushuApp/1");
        web.setOverScrollMode(WebView.OVER_SCROLL_NEVER);
        web.setBackgroundColor(0xFFF5FBFB);
        web.addJavascriptInterface(new Tts(), "AndroidTTS");
        web.setWebChromeClient(new WebChromeClient());
        web.setWebViewClient(new WebViewClient() {
            @Override public boolean shouldOverrideUrlLoading(WebView v, WebResourceRequest r) {
                Uri u = r.getUrl();
                if (HOST.equals(u.getHost())) return false;
                try { startActivity(new Intent(Intent.ACTION_VIEW, u)); } catch (Exception ignored) {}
                return true;
            }
        });
        setContentView(web);
        if (saved != null) web.restoreState(saved); else web.loadUrl(HOME);
    }

    @Override protected void onSaveInstanceState(Bundle out) { super.onSaveInstanceState(out); web.saveState(out); }

    @Override public void onBackPressed() {
        // Close an open flashcard session or sheet first, then leave the app.
        web.evaluateJavascript(
            "(function(){var x=document.querySelector('#study #xq');if(x){x.click();return 1}" +
            "var b=document.querySelector('.sheetBg');if(b){b.remove();return 1}" +
            "if(location.hash&&location.hash!=='#'){history.back();return 1}return 0})()",
            res -> { if (!"1".equals(res)) MainActivity.super.onBackPressed(); });
    }

    @Override protected void onPause() { super.onPause(); web.onPause(); }
    @Override protected void onResume() { super.onResume(); web.onResume(); }
    @Override protected void onDestroy() { if (tts != null) tts.shutdown(); web.destroy(); super.onDestroy(); }
}
