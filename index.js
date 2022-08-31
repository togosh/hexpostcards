var CONFIG = require('./config.json');
var DEBUG = CONFIG.debug;
console.log(DEBUG);

const http = require('http');
require('es6-promise').polyfill();
 
const express = require('express');
const path = require('path');
const fs = require('fs');
const https = require('https');
const schedule = require('node-schedule');

const { JSDOM } = require( "jsdom" );
const { window } = new JSDOM( "" );
const $ = require( "jquery" )( window );

const fetch = (...args) => import('node-fetch').then(({default: fetch}) => fetch(...args));

var hexPrice = '';
var leaderboardData = undefined;

var hostname = CONFIG.hostname;
if (DEBUG){ hostname = '127.0.0.1'; }

var httpPort = 80; 
if (DEBUG){ httpPort = 3000; }
const httpsPort = 443;

var httpsOptions = undefined;
if(!DEBUG){ httpsOptions = {
	cert: fs.readFileSync(CONFIG.https.cert),
	ca: fs.readFileSync(CONFIG.https.ca),
	key: fs.readFileSync(CONFIG.https.key)
};}

const app = express();

app.use(function(req, res, next) {
	next();
});

const httpServer = http.createServer(app);
var httpsServer = undefined;
if(!DEBUG){ httpsServer = https.createServer(httpsOptions, app);}

if(!DEBUG){ app.use((req, res, next) => 
{
  if(req.protocol === 'http') { 
    res.redirect(301, 'https://' + hostname); 
  }
  next(); 
}); }

app.use(express.static(path.join(__dirname, 'public')));

app.get("/", function(req, res){ res.sendFile('/index.html', {root: __dirname}); });
app.get("/contest", function(req, res){ res.sendFile('/public/contest.html', {root: __dirname}); });
app.get("/sacrifice", function(req, res){ res.sendFile('/public/sacrifice.html', {root: __dirname}); });
app.get("/sac", function(req, res){ res.sendFile('/public/sacrifice.html', {root: __dirname}); });

app.get("/grabdata", function (req, res) {
  grabData();
  res.send(new Date().toISOString() + ' - Grab Data!');
});

async function grabData(){
	console.log("grabData()");
	leaderboardData = await getLeaderboardData();
	io.emit("leaderboardData", leaderboardData);
}

var jobLive15 = schedule.scheduleJob("*/15 * * * *", function() { 
  grabData();
});

httpServer.listen(httpPort, hostname, () => { log(`Server running at http://${hostname}:${httpPort}/`);});
if(!DEBUG){ httpsServer.listen(httpsPort, hostname, () => { 
    log('listening on *:' + httpsPort); 
  });
}

var io = undefined;
if(DEBUG){ io = require('socket.io')(httpServer);
} else { io = require('socket.io')(httpsServer, {secure: true}); }

io.on('connection', (socket) => {
	log('SOCKET -- ************* CONNECTED: ' + socket.id + ' *************');
    socket.emit("hexPrice", hexPrice);
		socket.emit("leaderboardData", leaderboardData);
});


/////////////////////////////////////////////
// PRICE

if (CONFIG.price.enabled) {
	var priceTimer = CONFIG.price.timer * 60 * 1000;
	console.log("setup price timer");
	setInterval(function() {
		updatePrice();
	}, priceTimer); 
}

var priceUrl = "https://api.nomics.com/v1/currencies/ticker?key=" + CONFIG.price.nomicsKey + "&ids=HEX";

async function updatePrice(){
	console.log("updatePrice()");
	try {
		const resp = await fetch(priceUrl);
		const data = await resp.json();

		if (data && data.length >= 1) {
			var hexData = data[0];
			if (hexData && hexData.price) {
				hexPrice = parseFloat(hexData.price).toFixed(4).toString();
				io.emit("hexPrice", hexPrice);
			}
		}
	} catch (err) {
		log("PRICE --- ERROR - updatePrice() - " + err + "\n" + err.stack);
	}
}

const log = (message) => {
    console.log(new Date().toISOString() + ", " + message);
}


/////////////////////////////////////////////
// LEADERBOARD

async function getLeaderboardData(){
	var address1 = "0x716b1E629b0d3aBd14bD1E9E6557cdfaee839668";
  var address2 = "0x25D4CCeba035AabB7aC79C4F2fEaD5bC74E6B9d8";
  
  var output1 = await sumInputs(address1);
  await new Promise(r => setTimeout(r, 5000));
  console.log(output1);
  console.log("======= output1")
  
  var output1ERC20 = await sumInputsERC20(address1);
  await new Promise(r => setTimeout(r, 5000));
  console.log(output1ERC20);
  console.log("======= output1ERC20")
  
  var output2 = await sumInputs(address2);
  await new Promise(r => setTimeout(r, 5000));
  console.log(output2);
  console.log("======= output2")
  
  var output2ERC20 = await sumInputsERC20(address2);
  console.log(output2ERC20);
  console.log("======= output2ERC20")

  var final = output1.concat(output1ERC20, output2, output2ERC20);
  
  console.log("letsgo")
  
  final.sort((a, b) => parseFloat(b.usdValue) - parseFloat(a.usdValue));
  
  console.log(final);

	return final;
}

async function sumInputs(address){
  var data = await getInputs(address);
  
  var filteredData = data.filter(function (a) {
    return a.to.toLowerCase() == address.toLowerCase();
	});
  
  const map = new Map();
  for(const {from, usdValue} of filteredData) {
    const currSum = map.get(from) || 0;
    map.set(from, currSum + usdValue);
  }
  const output = Array.from(map, ([from, usdValue]) => ({from, usdValue}));

	return output;
}

async function getInputs(address){
  try {
    const resp = await fetch("https://api.ethplorer.io/getAddressTransactions/" + address + "?apiKey=freekey");
    const data = await resp.json();
    return data;
   } catch (err) {
     console.log("ERROR: " + err + "\n" + err.stack);
   }
}

async function sumInputsERC20(address){
  var data = await getInputsERC20(address);
  
  var filterTo = data.filter(function (a) {
    return a.to.toLowerCase() == address.toLowerCase();
	});
  
  var filteredData = filterTo.filter(function (a) {
    return (
			 a.tokenSymbol.toLowerCase() == "USDC".toLowerCase() 
		|| a.tokenSymbol.toLowerCase() == "USDT".toLowerCase()
		) 
		&& a.from.toLowerCase() != "0x88e6a0c2ddd26feeb64f039a2c41296fcb3f5640".toLowerCase() 
		&& a.from.toLowerCase() != "0xb4e16d0168e52d35cacd2c6185b44281ec28c9dc".toLowerCase() 
		&& a.from.toLowerCase() != "0x25D4CCeba035AabB7aC79C4F2fEaD5bC74E6B9d8".toLowerCase();
	});
  
  const map = new Map();
  for(const {from, value} of filteredData) {
    const currSum = map.get(from) || 0;
    map.set(from, currSum + value / 1000000);
  }
  const output = Array.from(map, ([from, value]) => ({from, usdValue: value}));

	return output;
}

async function getInputsERC20(address){
  try {
    const resp = await fetch("https://api.etherscan.io/api?module=account&action=tokentx&address=" + address + "&startblock=0&endblock=999999999&sort=asc&apikey=YourApiKeyToken");
    const data = await resp.json();
    return data.result;
   } catch (err) {
     console.log("ERROR: " + err + "\n" + err.stack);
   }
}
