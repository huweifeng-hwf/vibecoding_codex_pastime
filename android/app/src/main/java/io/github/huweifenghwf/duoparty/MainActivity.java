package io.github.huweifenghwf.duoparty;

import android.content.SharedPreferences;
import android.webkit.JavascriptInterface;
import android.webkit.WebView;

import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {
    @Override
    protected void load() {
        WebView webView = findViewById(com.getcapacitor.android.R.id.webview);
        webView.addJavascriptInterface(new RecordsStorage(
                getSharedPreferences("duo_records", MODE_PRIVATE)), "DuoRecords");
        super.load();
    }

    public static final class RecordsStorage {
        private final SharedPreferences preferences;

        RecordsStorage(SharedPreferences preferences) {
            this.preferences = preferences;
        }

        @JavascriptInterface
        public String getItem(String key) {
            return key.startsWith("duo.") ? preferences.getString(key, null) : null;
        }

        @JavascriptInterface
        public boolean setItem(String key, String value) {
            // Settlement reports success only after the record is written to disk.
            return key.startsWith("duo.") && preferences.edit().putString(key, value).commit();
        }
    }
}
