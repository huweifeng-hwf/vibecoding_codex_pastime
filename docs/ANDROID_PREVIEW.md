# Android 离线试玩

Android 工程使用 Capacitor，把 `dist/web` 打进安装包。打开「一起玩」即可同屏玩井字棋、五子棋、翻牌配对和飞行棋。战绩保存在 Android 的本地存储里，结算时写入磁盘，清除应用数据或卸载会清掉战绩。

构建需要 Node.js 22 或更新版本、JDK 21 或兼容的更高版本，以及 Android SDK Platform 36 和 Build Tools 35.0.0。安装 SDK 后，在终端设置 `JAVA_HOME` 和 `ANDROID_HOME`。在这台 Mac 上，可使用以下路径。

```sh
export JAVA_HOME=/opt/homebrew/opt/openjdk@24
export ANDROID_HOME="$HOME/Library/Android/sdk"
npm ci
npm run check
npm test
npm run build:android
```

APK 输出在 `android/app/build/outputs/apk/debug/app-debug.apk`。它使用 Gradle 的调试签名，可用于真机试玩。可以把 APK 复制到手机后打开安装，也可在已授权 USB 调试的设备上用 `adb install -r` 安装。

验收时，在断网状态下启动 App，分别完成四款游戏的一局。查看各游戏的本机战绩，再彻底结束 App 并重新打开，核对局数与胜场。翻牌配对和飞行棋按实际对局人数筛选战绩。
