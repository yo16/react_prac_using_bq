# react_prac_using_bq
BigQueryを使う練習

----
# 1. はじめに
Reactでサービスを作るにあたって、そのログをBigQueryへ格納しようと思います。なので、サーバー側のアプリケーションからBQへの、接続の技術検証です。
GCPの公式リファレンス（ [Node.js client library  |  Google Cloud](https://cloud.google.com/nodejs/docs/reference/bigquery/latest) ）を参考にし、イチから構築します。

# 2. 準備
## 2.1. サーバーアプリを作成
あるURLを指定されたら、BigQueryへInsertするサーバーアプリを作ります。でもその部分は後で実装するとして、まずはexpressで超単純な普通のWebサーバー「log_server」を作ります。
- 参考
	- Express公式のチュートリアル（express-generatorを使わないシンプル版）
		- [Installing Express](https://expressjs.com/en/starter/installing.html)
		- [Express "Hello World" example](https://expressjs.com/en/starter/hello-world.html)

expressを初期構築。`package.json`のmainをapp.jsにするって書いてあるけど、今回の作業には関係ないのでスルー。ついでに、`.env`を読むための`dotenv`というモジュールもインストールします。
```bash
$ mkdir log_server
$ cd log_server
$ npm init -y
$ npm install express dotenv
```

`app.js`を作成。後で、登録（post）を作る予定です。ログを登録するだけなので参照(get)はなし！
```javascript:react_prac_using_bq/log_server/app.js
require('dotenv').config();
const express = require('express');
const app = express();
const port = 3000;

app.get('/', (req, res) => {
  res.send('Hello World!');
});

app.listen(port, () => {
  console.log(`Example app listening on port ${port}`);
});
```

起動して動作確認。下記を実行して、`http://localhost:3000`でHello Worldが出ればOK。
```bash
$ node app.js
```

## 2.2. GCPのプロジェクト作成
いったんコーディングから離れて、GCPの操作です。参考：[Node.js client library  |  Google Cloud](https://cloud.google.com/nodejs/docs/reference/bigquery/latest)
まずはプロジェクトを作成します。
- プロジェクト名： survey-node-to-bq

API呼び出しによって費用が発生します。なので、無料期間が終わっている場合は、billingの設定が必要です。無料でできる範囲もあるかもしれませんが、基本的にビジネスで使うので、無料範囲の詳細は今は調べません。
技術検証の目的の場合は、プロジェクトを作って、調べ終わったら、プロジェクトごと削除（シャットダウン）するとよいです。これはGCPの手順書によく書いてある方法で、削除すれば完全に費用はかからないです。

なお、GCPの手順書によるとAPIを有効にする手順がありましたが、BigQuery APIは最初から有効化されていて、「APIとサービス」で有効化する必要はありませんでした。

## 2.3. BigQueryにテーブルを作成
ここも詳細は割愛。ログを想定しているのでそれっぽく。
- データセット： app_logs
- テーブル： button_clicked_log
	- ボタンをクリックしたらBigQueryに１レコード追加するアプリを作る予定
	- 項目は、文字列と数値を入れる感じで適当に

## 2.4. 認証情報をゲットして設定
ここ、私は苦手分野なので、手厚めに。

### 2.4.1. 読み物
[クライアント ライブラリを使用して認証する  |  Google Cloud](https://cloud.google.com/docs/authentication/client-libraries?hl=ja)
（要約）
「クライアントライブラリ」を使えば簡単。
「クライアントライブラリ」は、内部で「アプリケーションのデフォルト認証情報（ADC）」という道具を使う。そのためにADCの設定が必要。

[アプリケーションのデフォルト認証情報を設定する  |  Google Cloud](https://cloud.google.com/docs/authentication/provide-credentials-adc?hl=ja)
（要約）
ADCの認証設定は、プログラムの種類によって、４つに分けられる。
- ① ローカルで動かすプログラム
	- Google Cloud CLIの情報を使う
		- コマンドラインのGCP操作ツールでログインするんだから、それを使えば簡単。
		- ただし開発中のみ使える。逆に言うと本番では使わない。というかローカルの本番ってなんだろう？？
	- サービスアカウント（SA）認証情報
		- SAを発行して認証する
		- SAの権限借用を
			- 使用する場合
			- 使用しない場合　★★今回はこれ
				- JSONファイルをダウンロードして、そのパスを環境変数へ設定する
- ② GCP内にプログラムを置くパターンのプログラム
	- 基本的に不要。必要ならSAを使う。
- ③ GCPサービスの設定で、SAを指定できるパターンのプログラム
	- そこで指定する。
	- BigQueryはできない。
		- [サービス アカウントをリソースに関連付ける  |  IAM のドキュメント  |  Google Cloud](https://cloud.google.com/iam/docs/attach-service-accounts?hl=ja#attaching-new-resource)
- ④ オンプレミス or どこかのクラウド
	- Workload Identity か、SAを使う

### 2.4.2. GCP関連の手順
1. GCPの「IAMと管理」＞「サービスアカウント」で、サービスアカウントを作成。
	- アカウント名： sa_for_button_clicked_app
	- ロール
		- BigQueryジョブユーザー
			- クエリを投げる権限
			- "どこへ"という情報はなく、ただ投げる権限。ないと投げられない。
			- ジョブユーザー＜ユーザー＜管理者 という包括関係。
				- ユーザーは、一覧を見られる権限も付く。
				- 一覧なんて見なくても、扱うテーブルが決まってるなら、ジョブユーザーで十分。
		- BigQueryデータ編集者
			- 閲覧者＜編集者＜オーナー　という包括関係。
			- オプションでテーブルを指定できるけど、まぁ全部でいいや。
	- ユーザーにSAへのアクセス：許可しない
2. GCPの画面の、作ったSAの名前のリンクから、「キー」＞「鍵を追加」＞「新しい鍵を作成」＞「JSON」で、jsonファイルをゲットする。
3. ゲットしたjsonファイルの名前を適当に変える。`survey-node-to-bq.json`にしました。

### 2.4.3. サーバーの認証設定
次はソースに戻ります。
次はソースに戻ります。
1. `log_server/.gitignore` ファイルを作る
2. `log_server/.gitignore` ファイルに `/credentials`を追記する
3. `log_server/credentials` フォルダを作る
4. GCPからゲットしてリネームした`survey-node-to-bq.json`を格納する
	- `log_server/credentials/survey-node-to-bq.json` となります。
5. `log_server/.env` ファイルを作成し、jsonのパスを設定する
```:log_server/.env
GOOGLE_APPLICATION_CREDENTIALS="./credentials/survey-node-to-bq.json"
```

ここで、`git status`して、現れないことを確認します。必須。後回しにせず、いまこのタイミングでやるべき。
これをやらないと悪用され、Googleから大きな課金請求が来る可能性があるので、本当に慎重・確実に。

# 3. BigQueryへの連携＜本題＞
ここからが本題。

サーバーへ、Googleのモジュールをインストール。
```bash
$ npm install @google-cloud/bigquery
```

`app.js`を修正します。トップの`/`のget処理を消し、ログ登録の`/log`のpost処理を追加。
本筋ではありませんが、リクエスト時にJSONで渡したいので、JSONパーサーの設定もしてます。
```javascript:log_server/app.js
require('dotenv').config();
const express = require('express');
const app = express();
const bodyParser = require('body-parser')
const port = 3000;

// JSONパーサー
app.use(bodyParser.urlencoded({
    extended: true
}));
app.use(bodyParser.json());

// ログ登録
app.post("/log", (req, res) => {
    res.send("Recieved POST request!");
});

app.listen(port, () => {
    console.log(`Example app listening on port ${port}`);
});
```

ログ登録のところに、BQへ登録する処理を追加します。
- 参考
	- [Node.js client library  |  Google Cloud](https://cloud.google.com/nodejs/docs/reference/bigquery/latest)

長く書いちゃったけど、悩みポイントはあんまりないはず。非同期処理で、`Promise`インスタンスの`then()`、`catch()`を使います。
```javascript:log_server/app.js
～省略～
// Google Cloud client library をインポート
const {BigQuery} = require('@google-cloud/bigquery');
const bigquery = new BigQuery({
    projectId: "survey-node-to-bq",
});
～省略～
// ログ登録
app.post("/log", (req, res) => {
    const val1 = req.body.val1;
    const val2 = req.body.val2;
    const int1 = req.body.int1;
    const float1 = req.body.float1;

    const now = new Date();
    const now_str = 
        `${now.getFullYear()}-${now.getMonth()+1}-${now.getDate()} ` +
        `${now.getHours()}:${now.getMinutes()}:${now.getSeconds()}`;
    bigquery.query(
        "insert into `survey-node-to-bq.app_logs.button_clicked_log`"
        + `values ("${now_str}", "${val1}", "${val2}", ${int1}, ${float1});`
    ).then(data => {
        console.log("inserted!");
    }).catch(error => {
        console.log("ERROR OCCURRED!!");
        console.log(error);
    });

    res.send("Recieved POST request!");
});
～省略～
```

PostmanなどでPOSTを投げてテストするとよいです。curlでもいい。（詳細は割愛）

# 4. おわりに
GoogleのADCの説明は、いろいろなケースを書いてるから、とても大きなドキュメントになっていて敷居が高かったですが、じっくり読めばなんとか。。結果的にいくつかのケースのうちの１つしかやらないわけで、やることはそんなに多くはないです。でも疲れた。

個人的な学びとして、素人感丸出しですが、この作業によってサーバーとクライアントの役割が腑に落ちました。Reactだけで`npm run start`でできてそうなのに、なぜExpressとかサーバー系が必要なの？？って、まったく理解できていませんでした。React Routerとか"ぽい"やつがあることも初心者、少なくとも私にはノイズだったのかも。

わかってないせいで、Reactの中のコンポーネントに`@google-cloud/bigquery`をインストールし、実行して、fsがない的なエラーが出てました。独学者でこの悩み持ってる人、一定数いると思う。つまみ食いで作りたいものだけ作ってみて、体系的に勉強しないことも一因か。

# 5. 参考にしたサイトのまとめ
- GCP公式
	- Node.jsのモジュールのリファレンス
		- [Node.js client library  |  Google Cloud](https://cloud.google.com/nodejs/docs/reference/bigquery/latest)
	- 認証方法
		- [クライアント ライブラリを使用して認証する  |  Google Cloud](https://cloud.google.com/docs/authentication/client-libraries?hl=ja)
		- [アプリケーションのデフォルト認証情報を設定する  |  Google Cloud](https://cloud.google.com/docs/authentication/provide-credentials-adc?hl=ja)
- Express公式
	- 超単純なHelloWorldを書くまでのチュートリアル
		- [Installing Express](https://expressjs.com/en/starter/installing.html)
		- [Express "Hello World" example](https://expressjs.com/en/starter/hello-world.html)
- 参考にさせていただいたブログ
	- [node.jsからBigQueryを使う #Node.js - Qiita](https://qiita.com/zaburo/items/344ed0caab369c2f94c5)
