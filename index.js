const mongo = require('mongodb').MongoClient;
const url = 'mongodb://tictacdan:1234@localhost:27017/tictactoe';
const express = require('express');
const app = express();

mongo.connect(url, { useNewUrlParser: true }, (err, client) => {
  if (err) {
    console.error(err)
    return;
  };
  const WebSocket = require('ws');
  const wss = new WebSocket.Server({ port: 3003 });
  const db = client.db('tictactoe');
  const ObjectId = require('mongodb').ObjectId;

  db.collection('room').deleteMany({});

  function randomUsername() {
    var S4 = function() {
       return (((1+Math.random())*0x10000)|0).toString(16).substring(1);
    };
    return ('user' + S4()+S4());
  };

  function broadcast(data,gameId) {
    const collection = db.collection('room');
    collection.find({"_id": ObjectId(gameId)}).toArray((err, game) => {
      game.map(items => {
        items.players.map(player => {
          Array.from(wss.clients)
            .filter(client => client.id === player.clientID)
            .forEach(client => {
              client.send(data)
            })
        });
      });
    });
  };

  function createRoom(ws, msg) {
    const room = db.collection('room');
    room.insertOne({
      roomName: msg.roomName,
      date: Date.now(),
      rematch: [],
      players: [{ username: msg.username, move: msg.move, clientID: ws.id }],
      chat: []
    }, (err, result) => {
      if (err) {
        console.log(err)
        return;
      };
      const id = result.insertedId;
      const serverMsg = {
        type: "createGame",
        gameId: id,
        roomName: msg.roomName,
        move: msg.move,
        username: msg.username,
        clientID: ws.id
      };
      ws.send(JSON.stringify(serverMsg));
    });
  };

  function joinRoom(ws, msg) {
    const collection = db.collection('room');
    const id = msg.gameId;
    collection.find({"_id": ObjectId(id)}).toArray((err, game) => {
      if (err) {
        console.log(err);
      };
      game.map(details => {
        let serverMsg = {
          gameId: id
        };
        if (details.players.length > 1) {
          serverMsg.type = 'joinError';
          serverMsg.message = 'Game is full';
          console.log('game full')
        } else {
          const otherPlayerMove = details.players[0].move;
          const newUserMove = otherPlayerMove === "X" ? "O" : "X";
          collection.updateOne({"_id": ObjectId(id)},
            { $push : 
              { 
                "players": { username: msg.username, move: newUserMove, clientID: ws.id }
              }
            },
            (err, result) => {
            if (err) {
              console.log(err);
            }
            serverMsg.type = 'joinGame';
            serverMsg.move = newUserMove;
            serverMsg.roomName = details.roomName;
            serverMsg.username = msg.username;
            serverMsg.clientID = ws.id;
            collection.find({"_id": ObjectId(id)}).toArray((err, game) => {
              game.map(details => {
                const serverBroadcast = {
                  type: "notifyAllUsers",
                  users: details.players,
                  userThatJoined: msg.username
                };
                ws.send(JSON.stringify(serverMsg));
                broadcast(JSON.stringify(serverBroadcast), id);
              });
            });
          });
        };
      });
    });
  };

  function sendMessage(ws, msg) {
    const collection = db.collection('room');
    const id = msg.gameId;
    collection.updateOne({"_id": ObjectId(id)},
    { $push : 
      { 
        "chat": { username: msg.username, clientID: msg.clientID, message: msg.message }
      }
    },
    (err, result) => {
      if (err) {
        console.log('sendMessage Error', err)
      };
      const serverMsg = {
        type: 'messageDelivered',
        username: msg.username,
        clientID: msg.clientID,
      };
      const serverBroadcast = {
        type: 'newMessages',
        username: msg.username,
        clientID: msg.clientID,
        message: msg.message,
      };
      ws.send(JSON.stringify(serverMsg));
      broadcast(JSON.stringify(serverBroadcast), id);
    });
  };

  function leaveGame(ws, msg) {

    const collection = db.collection('room');
    const id = msg.gameId;
    collection.updateMany({"_id": ObjectId(id)},
    { $pull : 
      { 
        "chat": { clientID: msg.clientID },
        "players": { clientID: msg.clientID }
      }
    },
    (err, result) => {
      if (err) {
        console.log('leaveGame Error', err)
      };
      collection.find({"_id": ObjectId(id)}).toArray((err, gameDetails) => {
        if (err) {
          console.log(err)
        }
        gameDetails.map(game => {
          if (game.players.length === 0) {
            collection.deleteOne({"_id": ObjectId(id)});
          } else {
            const serverBroadcast = {
              type: 'notifyUserLeft',
              username: msg.username
            };
            broadcast(JSON.stringify(serverBroadcast), id);
          };
          const serverMsg = {
            type: 'leaveGame'
          };
          ws.send(JSON.stringify(serverMsg));
        });
      });
    });
  };

  function rematch(ws, msg) {
    const collection = db.collection('room');
    const id = msg.gameId;
    collection.updateOne({"_id": ObjectId(id)},
    { $push :
      { 
        "rematch": { username: msg.username, clientID: msg.clientID }
      }
    },
    (err, result) => {
      if (err) {
        console.log(err)
      }
      collection.find({"_id": ObjectId(id)}).toArray((err, game) => {
        game.map(details => {
          if (details.rematch.length > 1) {

            collection.updateOne({"_id": ObjectId(id)},
            { $pull : 
              { 
                "rematch": {},
              }
            },
            (err, result) => {
              if (err) {
                console.log(err)
                return
              }
              const serverBroadcastDone = {
                type: 'rematchStart'
              };
              broadcast(JSON.stringify(serverBroadcastDone), id);
            })
          } else {
            const serverMsg = {
              type: 'removeRematchButton'
            };
            const serverBroadcast = {
              type: "rematch",
              username: msg.username
            };
            ws.send(JSON.stringify(serverMsg));
            broadcast(JSON.stringify(serverBroadcast), id);
          };
          collection.find({"_id": ObjectId(id)}).toArray((err, game) => {
            JSON.stringify(game, null, 2)
          })
        });
      });
    });
  };

  app.use((_, res, next) => {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader("Access-Control-Allow-Methods", "GET,POST");
    res.setHeader("Access-Control-Allow-Headers", "Content-Type, Access-Control-Allow-Headers, Authorization, X-Requested-With");
    next();
  });

  app.get('/availablegames', (_, res) => {
    const collection = db.collection('room');
    collection.find().toArray((err, items) => {
      if (err) {
        console.log(err);
      };
      res.json(items);
    });
  });

  wss.on('connection', function connection(ws) {

    ws.id = randomUsername();
        
    ws.on('message', function incoming(message) {

      const msg = JSON.parse(message);
      let serverMsg
  
      switch(msg.type) {
        case "createGame":
          createRoom(ws, msg);
          break;
        case "joinGame":
          joinRoom(ws, msg);
          break;
        case "sendMessage":
          sendMessage(ws, msg);
          break;
        case "leaveGame":
          leaveGame(ws, msg);
          break;
        case "rematch":
          rematch(ws, msg);
          break;
        case "updateSquares":
          serverMsg = {
            type: "updateSquares",
            index: msg.index
          };
          broadcast(JSON.stringify(serverMsg), msg.gameId);
          break;
      };
    });
  });
  app.listen(3004);
});