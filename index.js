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

var mongoose = require('mongoose');
var Schema = mongoose.Schema;

var EthPriceSchema = new Schema({
	timestamp: {
    type: Number, 
    required: true
  },
	price: {
    type: Number, 
    required: true
  }
}, {
  collection: "ethprices"
});

const EthPrice = mongoose.model('EthPrices', EthPriceSchema);

var ethPrices = undefined;


var VoteSchema = new Schema({
  ip: { type: String, required: true },
  votes: [{ designId: Number, rank: Number }],
  createdAt: { type: Date, default: Date.now }
});

var Vote = mongoose.model('Vote', VoteSchema);


var mongoDB = CONFIG.mongodb.connectionString;
//if (!DEBUG){
mongoose.connect(mongoDB, {useNewUrlParser: true, useUnifiedTopology: true}).then(() => {
		log("Mongo Connected!");

    //ethPrices = getEthPrices();
    //getAndSet_currentEthPrice();
});
//}

async function getEthPrices(){
  console.log("getEthPrices()");
  ethPrices = await EthPrice.find();
  console.log(ethPrices);
  return ethPrices;
}

var hexPrice = '';
var leaderboardData = undefined;

var hostname = CONFIG.hostname;
if (DEBUG){ hostname = '127.0.0.1'; }

var httpPort = 80; 
if (DEBUG){ httpPort = 3000; }
const httpsPort = 443;

var httpsOptions = undefined;
if(!DEBUG){ 
  httpsOptions = {
    cert: fs.readFileSync(CONFIG.https.cert),
    key: fs.readFileSync(CONFIG.https.key)
  };
  if(CONFIG.https.ca !== undefined && CONFIG.https.ca != ""){
    httpsOptions.ca = fs.readFileSync(CONFIG.https.ca)
  }
}

const app = express();
app.use(express.json());

app.use(function(req, res, next) {
	next();
});

const httpServer = http.createServer(app);
var httpsServer = undefined;
if(!DEBUG){ httpsServer = https.createServer(httpsOptions, app);}

if(!DEBUG){
  app.use((req, res, next) => {
    if(req.protocol === 'http') {
      // Include the full URL path and query in the redirect
      const fullUrl = 'https://' + req.hostname + req.originalUrl;
      return res.redirect(307, fullUrl);
    }
    next();
  });
}

app.use(express.static(path.join(__dirname, 'public')));

app.get("/", function(req, res){ res.sendFile('/index.html', {root: __dirname}); });
app.get("/contest", function(req, res){ res.sendFile('/public/contest.html', {root: __dirname}); });
app.get("/donate", function(req, res){ res.sendFile('/public/donate.html', {root: __dirname}); });
app.get("/sacrifice", function(req, res){ res.sendFile('/public/donate.html', {root: __dirname}); });
app.get("/sac", function(req, res){ res.sendFile('/public/donate.html', {root: __dirname}); });
app.get("/takeaction", function(req, res){ res.sendFile('/public/takeaction.html', {root: __dirname}); });
app.get("/advertise", function(req, res){ res.sendFile('/public/takeaction.html', {root: __dirname}); });
app.get("/list", function(req, res){ res.sendFile('/public/takeaction.html', {root: __dirname}); });
app.get("/team", function(req, res){ res.sendFile('/public/team.html', {root: __dirname}); });
app.get("/about", function(req, res){ res.sendFile('/public/team.html', {root: __dirname}); });
app.get("/tutorial", function(req, res){ res.sendFile('/public/tutorial.html', {root: __dirname}); });
app.get("/instructions", function(req, res){ res.sendFile('/public/tutorial.html', {root: __dirname}); });
app.get("/guide", function(req, res){ res.sendFile('/public/tutorial.html', {root: __dirname}); });
app.get("/faq", function(req, res){ res.sendFile('/public/faq.html', {root: __dirname}); });

app.get("/grabdata", function (req, res) {
  grabData();
  res.send(new Date().toISOString() + ' - Grab Data!');
});

async function grabData(){
	console.log("grabData()");
  if (ethPrices) {
    var leaderboardResponse = await getLeaderboardData();
    if (leaderboardResponse != undefined){
      leaderboardData = leaderboardResponse;
      io.emit("leaderboardData", leaderboardData);

      fs.writeFile('./public/HEXpostcards_sacrifices.json', JSON.stringify(leaderboardData), (error) => {
        if (error) throw error;
      });
    }
  } else {
    console.log("WARNING! - ethPrices not defined yet!");
  }
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
// VOTING

app.post('/submit-vote', async (req, res) => {
  console.log(req.body);
  const ip = req.ip || req.headers['x-forwarded-for'] || req.connection.remoteAddress;
  console.log('IP Address:', ip);
  const votes = req.body.votes; // Expecting an array of objects with designId

  // Basic structural validation
  if (!Array.isArray(votes) || votes.length === 0 || votes.length > 5) {
    return res.status(400).json({ message: 'Invalid vote format.' });
  }

  // Validate each vote
  const validDesignIds = new Set([...Array(34).keys()].map(x => x + 1)); // Assuming design IDs 1 through 34 are valid
  const receivedIds = new Set();

  for (const vote of votes) {
    if (isNaN(Number(vote.designId)) || !validDesignIds.has(Number(vote.designId))) {
      return res.status(400).json({ message: 'Invalid designId in vote.' });
    }
    if (receivedIds.has(Number(vote.designId))) {
      return res.status(400).json({ message: 'Duplicate designId detected.' });
    }
    receivedIds.add(Number(vote.designId));
  }

  // Check if the IP has already submitted a vote
  const existingVote = await Vote.findOne({ ip: ip });
  if (existingVote) {
    // If a vote from this IP already exists, do not allow another vote
    return res.status(403).json({ message: 'You have already voted.' });
  }

  // Transform votes into the expected format
  const transformedVotes = [...receivedIds].map((designId, index) => ({
    designId,
    rank: index + 1 // Assign ranks based on the order of valid designIds received
  }));

  try {
    // If no existing vote is found, proceed to save the new vote
    await Vote.create({ ip, votes: transformedVotes });
    res.status(200).json({ message: 'Vote successfully recorded.' });
  } catch (error) {
    console.error('Error submitting vote:', error);
    res.status(500).json({ message: 'Error submitting vote' });
  }
});


app.get('/best-designs', async (req, res) => {
  try {
    res.status(500).send('Error fetching best designs');
    //const bestDesigns = await calculateBestDesigns();
    //res.json(bestDesigns);
  } catch (error) {
    res.status(500).send('Error fetching best designs');
  }
});

async function calculateBestDesigns() {
  const votes = await Vote.find();
  const scores = {};

  votes.forEach(vote => {
    vote.votes.forEach(({ designId, rank }) => {
      if (!scores[designId]) scores[designId] = 0;
      scores[designId] += (6 - rank); // Assuming 5 is the highest rank
    });
  });

  // Convert scores to an array and sort by score
  const sortedScores = Object.keys(scores).map(designId => ({
    designId: parseInt(designId),
    score: scores[designId]
  })).sort((a, b) => b.score - a.score);

  return sortedScores;
}


/////////////////////////////////////////////
// ETH PRICES

const ruleCurrentDay = new schedule.RecurrenceRule();
ruleCurrentDay.hour = 0;
ruleCurrentDay.minute = 0;
ruleCurrentDay.second = 30;
ruleCurrentDay.tz = 'Etc/UTC';

const jobCurrentDay = schedule.scheduleJob(ruleCurrentDay, function(){
  log('**** DAILY DATA TIMER 30S!');
  getAndSet_currentEthPrice();
});

async function getAndSet_currentEthPrice(){
  console.log("getAndSet_currentEthPrice()");
  var currentPrice = await getCurrentEthPrice();
  if (currentPrice == undefined){
    console.log("getAndSet_currentEthPrice() - ERROR - No Current Eth Price");
  }
  console.log("currentPrice");
  console.log(currentPrice);

  var price = Number(currentPrice);
  console.log("price");
  console.log(price);

  var start = new Date();
  start.setUTCHours(0,0,0,0);
  var timestamp = Number(Math.floor(start / 1000));
  console.log("timestamp");
  console.log(timestamp);

  var ethPrice = await EthPrice.findOne({timestamp: { $eq: timestamp }});
  if (ethPrice == undefined || ethPrice == null){
    console.log("Create new EthPrice!");
    const ethPrice = new EthPrice({ 
			timestamp: timestamp,
			price: price
		});

		ethPrice.save(function (err) {
			if (err) {
        log("getAndSet_currentEthPrice() - Save ERROR");
        return log(err);
      } else {
        log("New Eth Price Saved!");
        ethPrices = getEthPrices();
      }
		});
  } else {
    log("Eth Price already set Today!");
  }
}

async function getCurrentEthPrice(){
  try {
    const resp = await fetch("https://api.etherscan.io/api?module=stats&action=ethprice&apikey=" + CONFIG.etherscan.apikey);
    const data = await resp.json();
    console.log(data);
    if (data.result && data.result.ethusd){
      return data.result.ethusd;
    }
    return undefined;
   } catch (err) {
     console.log("ERROR: " + err + "\n" + err.stack);
   }
}


/////////////////////////////////////////////
// PRICE

if (CONFIG.price.enabled) {
	//var priceTimer = CONFIG.price.timer * 60 * 1000;
	//console.log("setup price timer");
	//setInterval(function() {
	//	updatePrice();
	//}, priceTimer); 
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

  try {
  var output1 = await sumInputs(address1);
  await new Promise(r => setTimeout(r, 10000));
  console.log(output1);
  console.log("======= output1")
  
  var output1ERC20 = await sumInputsERC20(address1);
  await new Promise(r => setTimeout(r, 10000));
  console.log(output1ERC20);
  console.log("======= output1ERC20")
  
  var output2 = await sumInputs(address2);
  await new Promise(r => setTimeout(r, 10000));
  console.log(output2);
  console.log("======= output2")
  
  var output2ERC20 = await sumInputsERC20(address2);
  console.log(output2ERC20);
  console.log("======= output2ERC20")

  var hexSacrifices = [{from: "0xa0a11bead773e0aa6cd26fdba170bc52c3b29baa", usdValue: 156.50}];
  var outsideSacrifices = [
    {from: "0x43642BcAC746eD8D4d00EB4E20d487aBdA741CAE", usdValue: 12027.42},
  ];

  var final = output1.concat(output1ERC20, output2, output2ERC20, hexSacrifices, outsideSacrifices);
  
  console.log("letsgo")
  
  final.sort((a, b) => parseFloat(b.usdValue) - parseFloat(a.usdValue));

  let map = new Map();
  map.set("a", {val: 1});

  final = final.map(x => ({
    ...x,
    rank: Number(map.get("a").val++)
  }))
  
  console.log(final);

	return final;
  } catch (e){
    console.log("getLeaderboardData() ERROR ======== ");
    console.log(e);
    return undefined;
  }
}

async function sumInputs(address){
  var data = await getInputs(address);
  console.log("data");
  console.log(data);
  
  var filteredData = data.filter(function (a) {
    return (a.to.toLowerCase() == address.toLowerCase() 
         && a.value != "0" 
         && a.value != 0);
	});
  
  const map = new Map();
  for(const {from, value, timeStamp} of filteredData) {
    console.log("timeStamp");
    console.log(timeStamp);
    var date = new Date(Number(timeStamp * 1000));
    date.setUTCHours(0,0,0,0);
    var dayTimestamp = Number(Math.floor(date / 1000));
    console.log("dayTimestamp: " + dayTimestamp);

    var index = ethPrices.findIndex(item => item.timestamp == dayTimestamp);
    if (index < 0){
      index = ethPrices.findIndex(item => item.timestamp == (dayTimestamp - 86400));
    }
    console.log("index: " + index);
    console.log("ethPrices: " + ethPrices[index].price);

    var usdValue = value / 1_000_000_000_000_000_000 * ethPrices[index].price;
    console.log("usdValue: " + usdValue);

    const currSum = map.get(from) || 0;
    map.set(from, currSum + usdValue);
  }
  const output = Array.from(map, ([from, usdValue]) => ({from, usdValue}));

	return output;
}

async function getInputs(address){
  try {
    const resp = await fetch("https://api.etherscan.io/api?module=account&action=txlist&address=" + address + "&startblock=0&endblock=999999999&sort=asc&apikey=" + CONFIG.etherscan.apikey);
    const data = await resp.json();
    return data.result;
   } catch (err) {
     console.log("ERROR: " + err + "\n" + err.stack);
   }
}

/* ETHPLORER API (ETH)
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
*/

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
		&& a.from.toLowerCase() != "0x25D4CCeba035AabB7aC79C4F2fEaD5bC74E6B9d8".toLowerCase()
    && a.from.toLowerCase() != "0x25d4365a85a8ea8c5baa773206f48e72a1a3b9d8".toLowerCase();
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
    const resp = await fetch("https://api.etherscan.io/api?module=account&action=tokentx&address=" + address + "&startblock=0&endblock=999999999&sort=asc&apikey=" + CONFIG.etherscan.apikey);
    const data = await resp.json();
    return data.result;
   } catch (err) {
     console.log("ERROR: " + err + "\n" + err.stack);
   }
}
