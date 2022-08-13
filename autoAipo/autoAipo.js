// アップデートするようエラーが表示されたらchromedriver.exeファイルを削除し，chromedriverフォルダに再度chromeと同じバージョンのものをダウンロードしてこのフォルダに入れなおす
const webdriver = require('selenium-webdriver');
const { Builder, By, until } = webdriver;
const date = require('date-utils');
const fs = require('fs');
const os = require('os');
let members = require('./members.json');
const { time } = require('console');
const XLSX = require('xlsx');
const { resolve } = require('path');
const chrome = require('selenium-webdriver/chrome');
const chromeOptions = new chrome.Options();
chromeOptions.excludeSwitches("enable-logging");
chromeOptions.setUserPreferences({
  'download.default_directory': './downloads'
});
chromeOptions.addArguments('--headless');
chromeOptions.addArguments('--no-sandbox');

const driver = new Builder().forBrowser('chrome').setChromeOptions(chromeOptions).build();

let outMembers = new Array();

// 今日の日付
let today = new Date();
let year;
let month;
// 今日の曜日
let dayOfWeek = today.getDay();
// (オプション)○週間前(先週分は1を入れる)
let week = 1;

// 先週の日付を配列形式で返す（月曜日から金曜日）
let calculateLastWeek = new Promise(async function(resolve, reject) {
  console.log("\n参照日は");
  let dates = [];
  let date = [];
  for(i=0; i<5; i++) {
    today = new Date();
    dates[i] = new Date(today.setDate(today.getDate() - dayOfWeek - 6 - ((week-1)*7) + i));
    year = dates[i].getFullYear();
    month = ("00" + (dates[i].getMonth()+1)).slice(-2);
    date[i] = ("00" + dates[i].getDate()).slice(-2);
    dates[i] = year + "/" + month + "/" + date[i];
    console.log(dates[i]);
  }
  console.log("です．\n");
  resolve(dates);
})

// 月をまたぐかどうか
let isSameMonth = calculateLastWeek.then(function(dates){
  if(dates[0].split('/')[1] === dates[4].split('/')[1]) {
    return true;
  } else {
    return false;
  }
})

let membersData = members.member;

// ダウンロードフォルダ内のファイル検索
let downloads = fs.readdirSync('./downloads', function(error, files){
  if(error) {
    console.log(error);
  }
});

try {
  // /Users/ユーザー名/Downloads内のtimecard.xlsのみ取得
  let timecardsXls = downloads.filter(function(files){
    return /timecard/.test(files);
  });
 
  if(timecardsXls.length) {
    for(i=0; i<timecardsXls.length; i++) {
      fs.unlinkSync('./downloads/' + timecardsXls[i]);
    }
    // console.log("\ntimecard.xls were deleted completely.\n");
  } else {
    // console.log("No timecard.xls in this directory...\n");
  }
} catch(error) {
  throw error;
}

// aipoにアクセス
driver.get('http://sv1.comm.nitech.ac.jp')
.then(async function(){
  // 10秒経っても見つからんかったらエラー
  await driver.wait(until.titleIs("Aipo"), 10000);
}).then(async function(){
  // もとから設定しておくタイプ（定時実行したいときはこちらから）
  // let userName = "";
  // let userPassword = "";

  // ユーザー名とパスワードを入力させるタイプ
  let userName = await readUserInput("ユーザー名を入力してください: ");
  let userPassword = await readUserInput("パスワードを入力してください: ");

  let inputName = await driver.findElement({ id: 'member_username' });
  let inputPassword = await driver.findElement({ id: 'password'});
  let login = await driver.findElement({ name: 'login_submit'});
  inputName.sendKeys(userName);
  inputPassword.sendKeys(userPassword);

  return new Promise(function(resolve){
    setTimeout(function(){
      login.click();
      resolve();
    }, 1000)
  })
}).then(async function(){
  return driver.wait(until.titleContains("Aipo"), 10000);
}).then(function(){
  // Aipo8からtimecard.xlsファイルをダウンロードし，ダウンロードフォルダからそれらを取得する
  console.log("\nWelcome to Aipo8! Now downloading...");
  return new Promise(async function(resolve, reject){
    await isSameMonth.then(async function(result){
      let count = 0;
      let downloadInterval = 300;
      let detectInterval = downloadInterval/10;
      let number, download, detection;
      // 月をまたがない場合
      if(result) {
        number = 0;
         // 一定時間ごとに
        download = setInterval(function() {
          if(count < membersData.length && number < membersData.length) {
            // ダウンロードを試みる
            driver.get('http://sv1.comm.nitech.ac.jp/portal/template/ExtTimecardXlsExportScreen/target_user_id/'+ membersData[number].id + '/view_month/' + year + '-' + month +'/f/timecard.xls')
            .then(function(){
              // 一定時間ごとに
              detection = setInterval(function(){
                // downloadsフォルダにtimecard.xlsファイルがないかチェックする
                if(fs.existsSync('./downloads/timecard.xls')){
                  // headless（CUI上で実行する場合）はダウンロードしたものがなぜか上書きされるので逐次別ファイルに置き換える
                  fs.renameSync('./downloads/timecard.xls', './downloads/timecard(' + count + ').xls', function(error){
                    if(error) {
                      throw error;
                    }
                  });
                  // 置き換えたファイルを取得
                  let renamed = fs.statSync('./downloads/timecard(' + count + ').xls');
                  // ファイルサイズが0（処理が速く，二重でtimecard.xlsが検出されると空ファイルを生成してしまう）ではないとき
                  if(renamed.size != 0) {
                    // 次のファイルを生成するために
                    count++;
                    // setIntervalの終了
                    clearInterval(detection);
                  }
                }    
              }, detectInterval);
            })
            .catch(function(error){
              throw error;
            })
          } else {
            // setIntervalの終了
            clearInterval(download);
          }
          number++;
        }, downloadInterval)
        return (downloadInterval+detectInterval)*(membersData.length);
      
      // 月をまたぐ場合
      } else {
        // ほとんど同じ
        number = 0;
        download = setInterval(function() {
          if(count < membersData.length*2 && number < membersData.length) {
            // 2ヵ月分ダウンロードするように
            for(i=0; i<2; i++) {
              driver.get('http://sv1.comm.nitech.ac.jp/portal/template/ExtTimecardXlsExportScreen/target_user_id/'+ membersData[number].id + '/view_month/' + year + '-' + (month - i) +'/f/timecard.xls')
              .then(function(){
                detection = setInterval(function(){
                  if(fs.existsSync('./downloads/timecard.xls')){
                    fs.renameSync('./downloads/timecard.xls', './downloads/timecard(' + count + ').xls', function(error){
                      if(error) {
                        throw error;
                      }
                    });
                    let renamed = fs.statSync('./downloads/timecard(' + count + ').xls');
                    if(renamed.size != 0) {
                      count++;
                      clearInterval(detection);
                    }
                  }    
                }, detectInterval);
              })
              .catch(function(error){
                throw error;
              })
            }
          } else {
            clearInterval(download);
          }
          number++;
        }, downloadInterval)
        return (downloadInterval+detectInterval)*(membersData.length*2);
      }
    }).then(function(timer){
      // ファイルのダウンロード時間を考慮
      setTimeout(async function(){
        let newDownloads = fs.readdirSync('./downloads', function(error, files){
          if(error) {
            console.log(error);
          }
          return files;
        });
        resolve(newDownloads.filter(function(files){
          return /timecard/.test(files);
        }));
      }, timer)
    })
  })
}).then(function(files){
  // 取得したxlsファイルをjsonに変換する
  let xlsxFiles = [];
  let sheetName, sheet;
  let json = [];

  return new Promise (function(resolve, reject){
    // ダウンロードできていない場合はエラー
    if(files.length) {
      console.log("timecards.xls (" + files.length +" files) were downloaded successfully.");
      for(i=0; i<files.length; i++) {
        xlsxFiles[i] = XLSX.readFile('./downloads/' + files[i], {cellDates: true});
        sheetName = xlsxFiles[i].SheetNames;
        sheet = xlsxFiles[i].Sheets[sheetName[0]];
        json[i] = XLSX.utils.sheet_to_json(sheet); 
      }
      resolve(json);
    } else {
      console.log("Error: No timecards.xls file could be downloaded. Maybe, invalid username or password.");
      reject();
    }
  })
}).then(async function(allJsonData){
  console.log("timecard.xls were converted to JSON successfully.");
  // 各ユーザーのデータを別々の配列に格納する
  let nameFilteredJsonData = [];

  return new Promise(function(resolve, reject){
    for(var eachJsonData of allJsonData) {
      nameFilteredJsonData.push(eachJsonData);
    }
    resolve(nameFilteredJsonData);
  })
}).then(function(allJsonData){
  console.log("1st step done.");
  // 各配列から先週分のみ抽出する
  let dateFilteredJsonData = [];
  return new Promise(function(resolve, reject){
    calculateLastWeek.then(function(dates){
      allJsonData.forEach(function(jsonData) {
        var newJsonData = jsonData.filter(function(json){
          for(var date of dates) {
            if(date == json.日付) {
              return true;
            }
          }
          return false;
        })
        dateFilteredJsonData.push(newJsonData);
      })
      resolve(dateFilteredJsonData);
    })
  })
}).then(function(allJsonData) {
  console.log("2nd step done.");
  // 月をまたぐ場合は配列を結合する
  let concatenatedJsonData = [];
  return new Promise(function(resolve, reject){
    for(var jsonData of allJsonData){
      var nameFilteredJsonData= [];
      var name = jsonData[0].氏名;
      var eachJsonData = allJsonData.filter(function(jsonData){
        return jsonData[0].氏名 == name;
      })

      // 月をまたぐ場合はここで結合される
      for(i=0; i<eachJsonData.length; i++) {
        for(var jsonData of eachJsonData[i]) {
          nameFilteredJsonData.push(jsonData);
        }
      }

      // これからpushする要素に重複がないか
      isDouble = concatenatedJsonData.some(function(eachJsonData) {
        return eachJsonData[0].氏名 == nameFilteredJsonData[0].氏名;
      })

      if(!isDouble){
        concatenatedJsonData.push(nameFilteredJsonData);
      }
    }
    resolve(concatenatedJsonData);
  })
}).then(function(allJsonData){
  console.log("3rd step done.");
  // 各配列から出席分を抽出する
  let attendedJsonData = [];
  return new Promise(function(resolve, reject){
    allJsonData.forEach(function(jsonData){
      // 月曜日から金曜日まで
      let attendance = 0;
      var newJsonData = jsonData.filter(function(json){
        if(json.曜日 == "Tue") {
          // 15:00以降に退勤していたら出席扱い
          let clockOut = json.退勤時間.split(':')[0];
          if(clockOut && clockOut >= 15) {
            attendance++;
            return true;
          }
        } else {
          let workTime1 = Number(json.就業時間) + Number(json.残業時間) + 1;
          let clockInHour = Number(json.出勤時間.split(':')[0]);
          let clockInMinuite = Number(json.出勤時間.split(':')[1]);
          let clockOutHour = Number(json.退勤時間.split(':')[0]);
          let clockOutMinute = Number(json.退勤時間.split(':')[1]);
          let workTime2 = (clockOutHour*60 + clockOutMinute) - (clockInHour*60 + clockInMinuite);
          if((workTime2 >= 360 || workTime2 < 0) && workTime1 >= 6.0) {
            attendance++;
            return true;
          }
        }
        return false;
      })
      
      if(!attendance) {
        outMembers.push({氏名: jsonData[0].氏名, 日数: 0, 曜日: " "});
      }

      attendedJsonData.push(newJsonData);
    })
    resolve(attendedJsonData);
  })
}).then(function(allJsonData){
  console.log("4th step done.");
  // 各配列から出席日数を取得する
  return new Promise(function(resolve, reject){
    allJsonData.forEach(function(jsonData){
      if(jsonData.length && jsonData.length < 4) {
        let daysOfWeek = [];
        for(json of jsonData) {
          daysOfWeek.push(json.曜日);
        }
        outMembers.push({氏名: jsonData[0].氏名, 日数: jsonData.length, 曜日: daysOfWeek.toString() + "day"});
      }
    })
    resolve(outMembers);
  })
}).then(function(outMembers){
  
  if(outMembers.length) {
    console.log("\n(outの可能性のある人): (出席日数と出席した曜日)");
    for(var outMember of outMembers) {
      console.log(outMember.氏名 + "さん: " + outMember.日数 + "日 " + outMember.曜日);
    }
    // console.log("\n報告に関しては院生ゼミの出席やAipo上のスケジュールを確認してからお願いします\n");
  } else {
    console.log("\n先週のoutはいませんでした! おめでとうございます!!\n");
  }

  // 以下，メールテンプレ
  console.log("\n（メールテンプレート）\n\n岡本先生\n\nお世話になっております．先週の出席状況についてご報告させていただきます．\n\n先週のout:\n\nとなります．引き続きどうぞよろしくお願い致します．\n");

  driver.close();
}).catch(function(error){
  driver.close();
})

// Aipoのユーザー名とパスワードを入力する（PCのユーザー名とは違うので注意）
function readUserInput(question) {
  const readline = require('readline').createInterface({
    input: process.stdin,
    output: process.stdout
  });

  return new Promise((resolve, reject) => {
    readline.question(question, (answer) => {
      resolve(answer);
      readline.close();
    });
  });
}

