require('dotenv').config();
const express = require('express');
const app = express();
const bodyParser = require('body-parser')
const port = 3000;

// Google Cloud client library をインポート
const {BigQuery} = require('@google-cloud/bigquery');
const bigquery = new BigQuery({
    projectId: "survey-node-to-bq",
});

// JSONパーサー
app.use(bodyParser.urlencoded({
    extended: true
}));
app.use(bodyParser.json());

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

app.listen(port, () => {
    console.log(`Example app listening on port ${port}`);
});
