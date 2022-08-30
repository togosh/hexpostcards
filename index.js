var CONFIG = require('./config.json');
var DEBUG = CONFIG.debug;
console.log(DEBUG);

const http = require('http');
require('es6-promise').polyfill();
 
const express = require('express');
const path = require('path');
const fs = require('fs');
const https = require('https');

const { JSDOM } = require( "jsdom" );
const { window } = new JSDOM( "" );
const $ = require( "jquery" )( window );

const fetch = (...args) => import('node-fetch').then(({default: fetch}) => fetch(...args));

var hexPrice = '';

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
