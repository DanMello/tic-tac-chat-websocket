const express = require('express');
const { URL } = require('url');
const app = express();
const WebSocket = require('ws');
const wss = new WebSocket.Server({ port: 3003 });
const { find, findOne, insertOne, insertMany, updateOne, updateMany, deleteOne, deleteMany } = require('./mongodb');
const ObjectId = require('mongodb').ObjectId;

deleteMany({});

function randomUsername() {
  var S4 = function() {
    return (((1+Math.random())*0x10000)|0).toString(16).substring(1);
  };
  return ('user' + S4()+S4());
};

function broadcast(data,gameId) {
  
  findOne({"_id": ObjectId(gameId)}).then(game => {
    game.players.map(player => {
      Array.from(wss.clients)
        .filter(client => client.id === player.clientID)
        .forEach(client => {
          client.send(data);
        });
    });
  });
};

function broadcastToAll(data) {
  Array.from(wss.clients)
    .forEach(client => {
      client.send(data);
    });
};

function handleError(ws, err) {

  const error = {
    type: "error",
    message: err.message
  };
  ws.send(JSON.stringify(error));
};

function createRoom(ws, msg) {
  insertOne({
    roomName: msg.roomName,
    date: Date.now(),
    rematch: [],
    players: [{ username: msg.username, move: msg.move, clientID: ws.id }],
    chat: []
  }).then(result => {
    const id = result.insertedId;
    const message = {
      type: "createGame",
      gameId: id,
      roomName: msg.roomName,
      move: msg.move,
      username: msg.username,
      clientID: ws.id
    };
    const messageToAll = {
      type: 'gamesChanged'
    };
    broadcastToAll(JSON.stringify(messageToAll));
    ws.send(JSON.stringify(message));
  }).catch(err => {
    handleError(ws, err);
  });
};

function joinRoom(ws, msg) {
  findOne({"_id": ObjectId(msg.gameId)}).then(result => {
    if (result === null) {
      throw new Error('Game no longer available');
    } else if (result.players.length > 1) {
      throw new Error('Game is full.');
    } else {
      const otherPlayerMove = result.players[0].move;
      const newUserMove = otherPlayerMove === "X" ? "O" : "X";
      updateOne({"_id": ObjectId(msg.gameId)},
      { $push :
        {
          "players": { username: msg.username, move: newUserMove, clientID: ws.id }
        }
      }).then(result => {
        if (!result.result.ok) {
          throw new Error('Something went wrong joining the current game.');
        };
        findOne({"_id": ObjectId(msg.gameId)}).then(game => {
          const message = {
            gameId: msg.gameId,
            type: 'joinGame',
            move: newUserMove,
            roomName: game.roomName,
            username: msg.username,
            clientID: ws.id
          };
          const messageToRoom = {
            type: "notifyAllUsers",
            users: game.players,
            userThatJoined: msg.username
          };
          const messageToAll = {
            type: 'gamesChanged'
          };
          ws.send(JSON.stringify(message));
          broadcast(JSON.stringify(messageToRoom), msg.gameId);
          broadcastToAll(JSON.stringify(messageToAll));
        }).catch(err => {
          handleError(ws, err);
        });
      }).catch(err => {
        handleError(ws, err);
      });
    };
  }).catch(err => {
    handleError(ws, err);
  });
};

function sendMessage(ws, msg) {
  updateOne({"_id": ObjectId(msg.gameId)},
  { $push : 
    {
      "chat": { username: msg.username, clientID: msg.clientID, message: msg.message }
    }
  }).then(() => {
    const message = {
      type: 'messageDelivered',
      username: msg.username,
      clientID: msg.clientID,
    };
    const messageToRoom = {
      type: 'newMessages',
      username: msg.username,
      clientID: msg.clientID,
      message: msg.message,
    };
    ws.send(JSON.stringify(message));
    broadcast(JSON.stringify(messageToRoom), msg.gameId);
  }).catch(err => {
    handleError(ws, err);
  });
};

function leaveGame(ws, msg) {
  updateMany({"_id": ObjectId(msg.gameId)},
  { $pull :
    { 
      "chat": { clientID: msg.clientID },
      "players": { clientID: msg.clientID }
    }
  }).then(() => {
    findOne({"_id": ObjectId(msg.gameId)}).then(game => {
      if (game.players.length === 0) {
        deleteOne({"_id": ObjectId(msg.gameId)}).then(result => {
          if (!result.result.ok) {
            throw new Error('Something went wrong deleting the current game.');
          };
        }).catch(err => {
          handleError(ws, err);
        });
      } else {
        const messageToRoom = {
          type: 'notifyUserLeft',
          username: msg.username,
          playerInGame: game.players[0]
        };
        broadcast(JSON.stringify(messageToRoom), msg.gameId);
      };
      const message = {
        type: 'leaveGame'
      };
      const messageToAll = {
        type: 'gamesChanged'
      };
      broadcastToAll(JSON.stringify(messageToAll));
      ws.send(JSON.stringify(message));
    }).catch(err => {
      handleError(ws, err);
    });
  }).catch(err => {
    handleError(ws, err);
  });
};

function rematch(ws, msg) {
  updateOne({"_id": ObjectId(msg.gameId)},
  { $push :
    { 
      "rematch": { username: msg.username, clientID: msg.clientID }
    }
  }).then(() => {
    findOne({"_id": ObjectId(msg.gameId)}).then(game => {
      if (game.rematch.length > 1) {
        updateOne({"_id": ObjectId(msg.gameId)},
        { $pull : 
          { 
            "rematch": {},
          }
        }).then(() => {
          const messageToRoom = {
            type: 'rematchStart'
          };
          broadcast(JSON.stringify(messageToRoom), msg.gameId);
        }).catch(err => {
          handleError(ws, err);
        })
      } else {
        const message = {
          type: 'removeRematchButton'
        };
        const messageToRoom = {
          type: "rematch",
          username: msg.username
        };
        ws.send(JSON.stringify(message));
        broadcast(JSON.stringify(messageToRoom), msg.gameId);
      };
    }).catch(err => {
      handleError(ws, err);
    });
  }).catch(err => {
    handleError(ws, err);
  });
};

function updateSquares(msg) {
  const message = {
    type: "updateSquares",
    index: msg.index
  };
  broadcast(JSON.stringify(message), msg.gameId);
};

function lostConnection(ws) {
  findOne({players: {$elemMatch : {clientID: ws.id}}}).then(data => {
    if (data === null) {
      return;
    };
    const player = data.players.filter(player => player.clientID === ws.id);
    updateOne({"_id": ObjectId(data._id)},
    { $pull :
      {
        "players": { clientID: ws.id }
      }
    }).then(result => {
      if (!result.result.ok) {
        throw new Error('Something went wrong removing the current player from the game. ', 'userid: ', ws.id);
      };
      findOne({"_id": ObjectId(data._id)}).then(game => {
        if (game.players.length === 0) {
          deleteOne({"_id": ObjectId(data._id)}).then(result => {
            if (!result.result.ok) {
              throw new Error('Something went wrong deleting the current game.', 'userid: ', ws.id);
            };
          }).catch(err => {
            console.log(err);
          });
        } else {
          const messageToRoom = {
            type: 'playerDisconnect',
            player: player[0]
          };
          broadcast(JSON.stringify(messageToRoom), data._id);
        };
        const messageToAll = {
          type: 'gamesChanged'
        };
        broadcastToAll(JSON.stringify(messageToAll));
      }).catch(err => {
        console.log(err);
      })
    }).catch(err => {
      console.log(err);
    });
  }).catch(err => {
    console.log(err);
  });
};

app.use((_, res, next) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader("Access-Control-Allow-Methods", "GET,POST");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, Access-Control-Allow-Headers, Authorization, X-Requested-With");
  next();
});

app.get('/availablegames', (_, res) => {
  find({}).then(games => {
    let orderedArray = games.sort(function(a,b){
      if (a.date > b.date) return -1;
      if (a.date < b.date) return 1;
      return 0;
    });
    res.json(orderedArray);
  });
});

app.get('/findGames', (req, res) => {
  const keyName = req.query.name;
  find({}).then(items => {
    const array = items.filter(item => {
      return item.roomName.toLowerCase().includes(keyName.toLowerCase()) || ObjectId(item._id).toString().includes(keyName.toLowerCase());
    });
    let orderedArray = array.sort(function(a,b){
      if (a.date > b.date) return -1;
      if (a.date < b.date) return 1;
      return 0;
    });
    res.json(orderedArray);
  }).catch(err => {
    res.status(400).json({type: 'error', message: err.message})
  });
});

wss.on('connection', function connection(ws, req) {
  const url_string = `${req.headers.origin}${req.url}`;
  const url = new URL(url_string);
  const clientID = url.searchParams.get("clientID");
  console.log(clientID)
  ws.id = clientID || randomUsername();
  ws.on('message', function incoming(message) {
    const msg = JSON.parse(message);
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
        updateSquares(msg);
        break;
    };
  });
  ws.on('error', function error() {
    lostConnection(ws);
  });
  ws.on('close', function close(code) {
    if (code !== 1006) {
      lostConnection(ws);
    };
  });
});
app.listen(3004);