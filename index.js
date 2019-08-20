require('dotenv').config();
const express = require('express');
const { URL } = require('url');
const app = express();
const WebSocket = require('ws');
const wss = new WebSocket.Server({ port: 3003 });
const { find, findOne, insertOne, insertMany, updateOne, updateMany, deleteOne, deleteMany } = require('./mongodb');
const { send } = require('./sendText');
const ObjectId = require('mongodb').ObjectId;
const crypto = require('crypto');
const address = process.env.NODE_ENV === 'production' ? 
'https://mellocloud.com/tic-tac-chat' : 'http://10.0.0.189';

deleteMany({});

function randomUsername() {
  var S4 = function () {
    return (((1 + Math.random()) * 0x10000) | 0).toString(16).substring(1);
  };
  return ('user' + S4() + S4());
};

function broadcastToRoom(data, gameId) {
  findOne({ "_id": ObjectId(gameId) }).then(game => {
    game.players.map(player => {
      Array.from(wss.clients)
        .filter(client => client.id === player.clientID)
        .forEach(client => {
          client.send(data);
        });
    });
  });
};

function broadcastToClient(data, id) {
  Array.from(wss.clients)
    .filter((client) => {
      return client.id === id
    }).map(client => {
      client.send(data)
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

function redirectError(ws, url) {
  const error = {
    type: "redirectError",
    url: url
  };
  ws.send(JSON.stringify(error));
};

function createRoom(ws, msg) {
  insertOne({
    roomName: msg.roomName,
    date: Date.now(),
    activeAt: new Date(),
    rematch: [],
    players: [{ username: msg.username, move: msg.move, clientID: ws.id, host: true }],
    chat: [],
    tokens: [],
    private: false
  }).then(result => {
    const id = result.insertedId;
    const message = {
      type: "createGame",
      gameId: id,
      roomName: msg.roomName,
      move: msg.move,
      username: msg.username,
      clientID: ws.id,
      host: true
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
  findOne({ "_id": ObjectId(msg.gameId) }).then(result => {
    if (result === null) {
      throw new Error('Game no longer available');
    } else if (result.players.length > 1) {
      throw new Error('Game is full.');
    } else if (result.private) {
      throw new Error('Game is private please refresh.');
    } else {
      const otherPlayerMove = result.players[0].move;
      const newUserMove = otherPlayerMove === "X" ? "O" : "X";
      updateMany({ "_id": ObjectId(msg.gameId) },
        {
          $push:
          {
            "players": { username: msg.username, move: newUserMove, clientID: ws.id, host: false }
          },
          $set:
          {
            "activeAt": new Date()
          }
        }).then(result => {
          if (!result.result.ok) {
            throw new Error('Something went wrong joining the current game.');
          };
          findOne({ "_id": ObjectId(msg.gameId) }).then(game => {
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
            broadcastToRoom(JSON.stringify(messageToRoom), msg.gameId);
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
  findOne({"_id": ObjectId(msg.gameId)}).then(game => {
    if (!game) {
      throw new Error('Game no longer exists. All games get deleted after 10 mins of inactivity.')
    };
    updateMany({ "_id": ObjectId(msg.gameId) },
    {
      $push:
      {
        "chat": { username: msg.username, clientID: msg.clientID, message: msg.message }
      },
      $set:
      {
        "activeAt": new Date()
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
      broadcastToRoom(JSON.stringify(messageToRoom), msg.gameId);
    }).catch(err => {
      handleError(ws, err);
    });
  }).catch(err => {
    redirectError(ws, `${address}?error=${err.message}`);
  });
};

function leaveGame(ws, msg) {
  findOne({"_id": ObjectId(msg.gameId)}).then(game => {
    if (!game) {
      throw new Error('Game no longer exists. All games get deleted after 10 mins of inactivity.')
    };
    updateMany({ "_id": ObjectId(msg.gameId) },
    {
      $pull:
      {
        "chat": { clientID: msg.clientID },
        "players": { clientID: msg.clientID }
      },
      $set:
      {
        "activeAt": new Date()
      }
    }).then(() => {
      findOne({ "_id": ObjectId(msg.gameId) }).then(game => {
        if (game.players.length === 0) {
          deleteOne({ "_id": ObjectId(msg.gameId) }).then(result => {
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
          broadcastToRoom(JSON.stringify(messageToRoom), msg.gameId);
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
  }).catch(err => {
    redirectError(ws, `${address}?error=${err.message}`);
  });
};

function rematch(ws, msg) {
  findOne({"_id": ObjectId(msg.gameId)}).then(game => {
    if (!game) {
      throw new Error('Game no longer exists. All games get deleted after 10 mins of inactivity.')
    };
    updateMany({ "_id": ObjectId(msg.gameId) },
    {
      $push:
      {
        "rematch": { username: msg.username, clientID: msg.clientID }
      },
      $set:
      {
        "activeAt": new Date()
      }
    }).then(() => {
      findOne({ "_id": ObjectId(msg.gameId) }).then(game => {
        if (game.rematch.length > 1) {
          updateMany({ "_id": ObjectId(msg.gameId) },
            {
              $pull:
              {
                "rematch": {},
              },
              $set:
              {
                "activeAt": new Date()
              }
            }).then(() => {
              const messageToRoom = {
                type: 'rematchStart'
              };
              broadcastToRoom(JSON.stringify(messageToRoom), msg.gameId);
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
          broadcastToRoom(JSON.stringify(messageToRoom), msg.gameId);
        };
      }).catch(err => {
        handleError(ws, err);
      });
    }).catch(err => {
      handleError(ws, err);
    });
  }).catch(err => {
    redirectError(ws, `${address}?error=${err.message}`);
  });
};

function updateSquares(ws, msg) {
  const message = {
    type: "updateSquares",
    index: msg.index
  };
  findOne({"_id": ObjectId(msg.gameId)}).then(game => {
    if (!game) {
      throw new Error('Game no longer exists. All games get deleted after 10 mins of inactivity.')
    };
    updateOne({ "_id": ObjectId(msg.gameId) },
      {
        $set: {"activeAt": new Date()}
      }).then(result => {
        if (!result.result.ok) {
          throw new Error('Something went wrong');
        };
        broadcastToRoom(JSON.stringify(message), msg.gameId);
      }).catch(err => {
        handleError(ws, err);
      });
  }).catch(err => {
    redirectError(ws, `${address}?error=${err.message}`);
  });
};

function lostConnection(ws) {
  findOne({ players: { $elemMatch: { clientID: ws.id } } }).then(data => {
    if (data === null) {
      return;
    };
    const player = data.players.filter(player => player.clientID === ws.id);
    updateMany({ "_id": ObjectId(data._id) },
      {
        $pull:
        {
          "players": { clientID: ws.id }
        },
        $set:
        {
          "activeAt": new Date()
        }
      }).then(result => {
        if (!result.result.ok) {
          throw new Error('Something went wrong removing the current player from the game. ', 'userid: ', ws.id);
        };
        findOne({ "_id": ObjectId(data._id) }).then(game => {
          if (game.players.length === 0) {
            deleteOne({ "_id": ObjectId(data._id) }).then(result => {
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
            broadcastToRoom(JSON.stringify(messageToRoom), data._id);
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

function kickPlayer(ws, msg) {
  findOne({"_id": ObjectId(msg.gameId)}).then(game => {
    if (!game) {
      throw new Error('Game no longer exists. All games get deleted after 10 mins of inactivity.')
    };
    updateMany({ "_id": ObjectId(msg.gameId) },
    {
      $pull:
      {
        "chat": { clientID: msg.clientID },
        "players": { clientID: msg.clientID }
      },
      $set:
      {
        "activeAt": new Date()
      }
    }).then(() => {
      const message = {
        type: 'kicked'
      };
      const messageToAll = {
        type: 'gamesChanged'
      };
      const messageToHost = {
        type: 'playerwaskicked'
      };
      broadcastToAll(JSON.stringify(messageToAll));
      broadcastToClient(JSON.stringify(message), msg.clientID);
      ws.send(JSON.stringify(messageToHost));
    });
  }).catch(err => {
    redirectError(ws, `${address}?error=${err.message}`);
  });
};

function joinFromInvite(ws, msg) {
  findOne({"_id": ObjectId(msg.gameId)}).then(game => {
    if (!game) {
      throw new Error('Game no longer available.');
    } else if (game.players.length > 1 && !game.players.some(e => e.clientID === msg.clientID)) {
      throw new Error('Game is full.');
    } else {
      findOne({"_id": ObjectId(msg.gameId), "tokens.clientID": msg.clientID, "tokens.token": msg.token}).then(gameWithToken => {
        if (gameWithToken === null) {
          throw new Error('Invite has expired.');
        } else {
          updateMany({"_id": ObjectId(msg.gameId), "tokens.clientID": msg.clientID, "tokens.token": msg.token},
          {
            $pull:
            {
             "tokens": { clientID: msg.clientID, token: msg.token}
            },
            $set:
            {
              "activeAt": new Date()
            }
          }).then(async (removedToken) => {
            if (!removedToken.result.ok) {
              throw new Error('Something went wrong joining game.');
            };
            if (msg.name !== null && msg.name !== '') {
              await updateMany({ "_id": ObjectId(msg.gameId), "players.username": msg.username },
              {
                $set:
                {
                  "players.$.username": msg.name,
                  "activeAt": new Date()
                }
              }).then(updatedUserName => {
                if (!updatedUserName.result.ok) {
                  throw new Error('Something went wrong joining game with your username.');
                };
              }).catch(err => {
                handleError(ws, err);
              });
            };
            findOne({"_id": ObjectId(msg.gameId)}).then(newGame => {
              if (!game) {
                throw new Error('Something went wrong.');
              };
              const otherPlayerMove = newGame.players[0].move;
              const newUserMove = otherPlayerMove === "X" ? "O" : "X";
              const name = msg.name ? msg.name : msg.username
              const message = {
                gameId: msg.gameId,
                type: 'joinGame',
                move: newUserMove,
                roomName: game.roomName,
                username: name,
                clientID: ws.id
              };
              const messageToRoom = {
                type: "notifyAllUsers",
                users: newGame.players,
                userThatJoined: name
              };
              const messageToAll = {
                type: 'gamesChanged'
              };
              ws.send(JSON.stringify(message));
              broadcastToRoom(JSON.stringify(messageToRoom), msg.gameId);
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
  }).catch(err => {
    handleError(ws, err);
  });
};

app.use((_, res, next) => {
  res.header('Access-Control-Allow-Origin', '*');
  res.header("Access-Control-Allow-Methods", "GET,POST");
  res.header("Access-Control-Allow-Headers", "Origin, X-Requested With, Content-Type, Accept");
  next();
});

app.use(express.json());

app.get('/availablegames', (_, res) => {
  find({}).then(games => {
    let gamesList = games.filter(currentGame => !currentGame.private).sort(function (a, b) {
      if (a.date > b.date) return -1;
      if (a.date < b.date) return 1;
      return 0;
    })
    res.json(gamesList);
  });
});

app.get('/findGames', (req, res) => {
  const keyName = req.query.name;
  find({}).then(items => {
    const array = items.filter(item => {
      return item.roomName.toLowerCase().includes(keyName.toLowerCase()) || ObjectId(item._id).toString().includes(keyName.toLowerCase());
    });
    let orderedArray = array.sort(function (a, b) {
      if (a.date > b.date) return -1;
      if (a.date < b.date) return 1;
      return 0;
    });
    res.json(orderedArray);
  }).catch(err => {
    res.status(400).json({ type: 'error', message: err.message })
  });
});

app.get('/tic-tac-chat', (req, res) => {
  findOne({ "_id": ObjectId(req.query.gameId) }).then(game => {
    if (!game) {
      throw new Error('Game no longer available');
    } else if (game.players.length > 1) {
      throw new Error('Game is full.');
    } else {
      findOne({"_id": ObjectId(req.query.gameId), "tokens.gameId": req.query.gameId, "tokens.token": req.query.token}).then(gameWithToken => {
        if (!gameWithToken) {
          throw new Error('Invite has expired.');
        } else {
          updateOne({"_id": ObjectId(req.query.gameId), "tokens.gameId": req.query.gameId, "tokens.token": req.query.token },
          {
            $pull:
            {
             "tokens": { gameId: req.query.gameId, token: req.query.token }
            }
          }).then(removedToken => {
            if (!removedToken.result.ok) {
              throw new Error('Something went wrong.')
            };
            const token = crypto.randomBytes(12).toString('hex');
            const clientID = randomUsername();
            const username = randomUsername();
            const otherPlayerMove = game.players[0].move;
            const newUserMove = otherPlayerMove === "X" ? "O" : "X";
            updateMany({ "_id": ObjectId(req.query.gameId) },
              {
                $push:
                {
                  "players": { username: username, move: newUserMove, clientID: clientID, host: false },
                  "tokens": { clientID: clientID, token: token }
                }
              }).then(result => {
                if (!result.result.ok) {
                  throw new Error('Something went wrong joining the current game.');
                };
                res.redirect(`${address}?clientID=${clientID}&username=${username}&gameId=${req.query.gameId}&token=${token}`);
              }).catch(err => {
                res.redirect(`${address}?error=${err.message}`);
              });
          }).catch(err => {
            res.redirect(`${address}?error=${err.message}`);
          });
        };
      }).catch(err => {
        res.redirect(`${address}?error=${err.message}`);
      });
    };
  }).catch(err => {
    res.redirect(`${address}?error=${err.message}`);
  });
});

app.post('/checkPrivacy', (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  findOne({"_id": ObjectId(req.body.gameId)}).then(game => {
    if (!game) {
      throw new Error('Game no longer exists. All games get deleted after 10 mins of inactivity.')
    };
    res.json({checkBoxValue: game.private});
  }).catch(err => {
    res.json({redirect: true, url: `${address}?error=${err.message}`});
  });
});

app.post('/toggleGamePrivate', (req, res) => {
  findOne({"_id": ObjectId(req.body.gameId)}).then(game => {
    if (!game) {
      throw new Error('Game no longer exists. All games get deleted after 10 mins of inactivity.')
    };
    updateMany({"_id": ObjectId(req.body.gameId)},
    {
      $set:
      {
       "private": req.body.checked,
       "activeAt": new Date()
      }
    }).then(updatedPrivacy => {
      if (!updatedPrivacy.result.ok) {
        throw new Error('Failed to update game privacy.');
      };
      const messageToAll = {
        type: 'gamesChanged'
      };
      broadcastToAll(JSON.stringify(messageToAll));
      res.json({ message: 'ok' });
    }).catch(err => {
      res.json({ error: true, message: err.message })
    });
  }).catch(err => {
    res.json({redirect: true, url: `${address}?error=${err.message}`});
  });
});

app.post('/sendInvite', (req, res) => {
  findOne({"_id": ObjectId(req.body.gameId)}).then(game => {
    if (!game) {
      throw new Error('Game no longer exists. All games get deleted after 10 mins of inactivity.')
    };
    const token = crypto.randomBytes(6).toString('hex');
    updateMany({"_id": ObjectId(req.body.gameId)},
    {
      $push:
      {
       "tokens": { gameId: req.body.gameId, token: token }
      },
      $set:
      {
        "activeAt": new Date()
      }
    }).then(createdToken => {
      if (!createdToken.result.ok) {
        throw new Error('Failed to send invite.');
      };
      send(req.body, token).then(() => {
        res.json({ message: 'ok' });
      });
    }).catch(err => {
      res.json({ error: true, message: err.message })
    });
  }).catch(err => {
    res.json({redirect: true, url: `${address}?error=${err.message}`});
  });
});

wss.on('connection', function connection(ws, req) {
  const url_string = `${req.headers.origin}${req.url}`;
  const url = new URL(url_string);
  const clientID = url.searchParams.get("clientID");
  ws.id = clientID || randomUsername();

  ws.on('message', function incoming(message) {
    const msg = JSON.parse(message);
    switch (msg.type) {
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
        updateSquares(ws, msg);
        break;
      case "kickPlayer":
        kickPlayer(ws, msg);
        break;
      case "joinFromInvite":
        joinFromInvite(ws, msg);
        break;
    };
  });
  ws.on('error', function error() {
    lostConnection(ws);
  });
  ws.on('close', function close(code) {
    if (code === 4001) {
      lostConnection(ws);
    };
  });
});
app.listen(3004);