//Setup web server and socket
var twitter = require('twitter'),
    express = require('express'),
    app = express(),
    http = require('http'),
    server = http.createServer(app),
    io = require('socket.io').listen(server);

//Setup twitter stream api
var tw = new twitter({
  consumer_key: 'dWSj5FLKxvAmU4fVlEkdfipdR',
  consumer_secret: 'WRffxPBfZspiBfH43bWRSo5B4ZAueCS6jl04kXddAGabQL0L0r',
  access_token_key: '22242886-f2TuagbNuM3Jhcj8itvMkso6PMQubVDY33CyQrvvB',
  access_token_secret: 'wwdIz0TNXGgw0uzevysSboJChJrVWomlIrMJKzo1wA0wE'
}),
stream = null;

var mongodb = require('mongodb');
var MongoClient = mongodb.MongoClient;
var mongoURL = 'mongodb://localhost:27017/twitter';

// var AlchemyAPI = require('./alchemyapi');
// var alchemyapi = new AlchemyAPI();

var keyword;

console.log("started server...");
//Use the default port (for beanstalk) or default to 8081 locally
server.listen(process.env.PORT || 8081);

//Setup routing for app
app.use(express.static(__dirname + '/public'));

//Create web sockets connection
io.sockets.on('connection', function (socket) {

  socket.on("start tweets", function () {
    console.log("Starting to send tweets");
    if(stream === null) {

      //Connect to twitter stream, filter for all possible world locations
      tw.stream('statuses/filter', {'locations':'-180,-90,180,90'}, function(stream) {
        // Connect to Mongo to load previous tweets and save new ones received
        MongoClient.connect(mongoURL, function (err, db) {
            if (err) throw err
            console.log('Mongo connection established to ', mongoURL);
            var collection = db.collection('tweets');

            var cursor = collection.find();
            cursor.each(function (err, mongoTweet) {
              if (err) {
                console.log(err);
              } else if (mongoTweet != null){
                  var outputPoint = {"lat": mongoTweet.latitude,"lng": mongoTweet.longitude};
                  socket.broadcast.emit("twitter-mongo-load", outputPoint);
                  socket.emit('twitter-mongo-load', outputPoint);
              }
            });

            stream.on('data', function(data) {
                // Only use tweets with location co-ordinates
                if (data.coordinates){
                  if (data.coordinates !== null) {

                    if (keyword === undefined || keyword === null || RegExp("(^|\\s+)#*" + keyword + "\(\\s+|$)", "i").test(data.text)) {

                      var outputPoint = {"lat": data.coordinates.coordinates[0],"lng": data.coordinates.coordinates[1]};

                      socket.broadcast.emit("twitter-stream", outputPoint);
                      socket.emit('twitter-stream', outputPoint);
                    }

                    var tweetToSave = {
                      tweetId:data.id_Str,
                      text:data.text,
                      latitude:data.coordinates.coordinates[0], 
                      longitude:data.coordinates.coordinates[1]
                    };
               /*              
                    if (data.lang === "en"){
                      console.log('Language: ' + data.lang);
                      console.log('Text: ' + data.text);
                      alchemyapi.sentiment("text", data.text, {}, function(response,err){
                        if (err) { console.log(err);
                        } else
                          console.log("Sentiment: " + response["docSentiment"]["type"]);
                      });
                    }
                */
                    collection.insert(tweetToSave, function(err, records){
                      if(err) console.log("Error writing to mongo:" + err);                      
                    });
                  }
                }
            });

            stream.on('limit', function(limitMessage) {
              return console.log(limitMessage);
            });
            stream.on('warning', function(warning) {
              return console.log(warning);
            });
            stream.on('disconnect', function(disconnectMessage) {
              return console.log(disconnectMessage);
            });
        });
      });
    }
  });

  // When a "message" is received (click on the button), it's logged in the console
  socket.on('message', function (message) {
    console.log('Got message: ' + message);
  });

  socket.on("filter tweets", function (filterKeyword) {
    console.log('filtering on keyword: ' + filterKeyword);
    keyword = filterKeyword;

    MongoClient.connect(mongoURL, function (err, db) {
      if (err) throw err;
      var collection = db.collection('tweets');

      var cursor = collection.find();
      cursor.each(function (err, mongoTweet) {
        if (err) {
          console.log(err); throw err;
        } else if (mongoTweet !== null){
            var outputPoint = {"lat": mongoTweet.latitude,"lng": mongoTweet.longitude};

            if (keyword === undefined || keyword === null || RegExp("(^|\\s+)#*" + keyword + "\(\\s+|$)", "i").test(mongoTweet.text)) {
              var outputPoint = {"lat": mongoTweet.latitude,"lng": mongoTweet.longitude};
               socket.broadcast.emit("twitter-mongo-load", outputPoint);
                socket.emit('twitter-mongo-load', outputPoint);
            }                 
        }
      });
    });
    
  });

  // Signal the client that they are connected and can start receiving tweets
  console.log("client connected");
  socket.emit("connected");
});