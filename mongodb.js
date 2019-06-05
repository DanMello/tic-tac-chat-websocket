
const MongoClient = require('mongodb').MongoClient;
const url = "mongodb://tictacdan:1234@localhost:27017/tictactoe";
const connection = MongoClient.connect(url, { useNewUrlParser: true });

function dbFindFactory(connection) {
  return function factory(db, collection, data) {
    return connection.then(client => {
      return new Promise((resolve, reject) => {
        client.db(db).collection(collection).find(data).toArray((err, array) => {
          if (err) {
            reject(err);
          } else {
            resolve(array);
          };
        });
      });
    });
  };
};
function dbFindMethod(dbFactory, db, collection) {
  return function method(data) {
    return dbFactory(db, collection, data);
  };
};

const findFactory = dbFindFactory(connection);
const find = dbFindMethod(findFactory, 'tictactoe', 'room');

function dbFindOneFactory(connection) {
  return function factory(data) {
    return connection.then(client => {
      return new Promise((resolve, reject) => {
        client.db('tictactoe').collection('room').findOne(data, (err, result) => {
          if (err) {
            reject(err);
          } else {
            resolve(result);
          };
        });
      });
    });
  };
};
function dbFindOneMethod(dbFactory) {
  return function method(data) {
    return dbFactory(data)
  };
};

const findOneFactory = dbFindOneFactory(connection);
const findOne = dbFindOneMethod(findOneFactory);

function dbInsertOneFactory(connection) {
  return function factory(data) {
    return connection.then(client => {
      return new Promise((resolve, reject) => {
        client.db('tictactoe').collection('room').insertOne(data, (err, result) => {
          if (err) {
            reject(err);
          } else {
            resolve(result);
          };
        });
      });
    });
  };
};
function dbInsertOneMethod(dbFactory) {
  return function method(data) {
    return dbFactory(data)
  };
};

const insertOneFactory = dbInsertOneFactory(connection);
const insertOne = dbInsertOneMethod(insertOneFactory);

function dbInsertManyFactory(connection) {
  return function factory(data) {
    return connection.then(client => {
      return new Promise((resolve, reject) => {
        client.db('tictactoe').collection('room').insertMany(data, (err, result) => {
          if (err) {
            reject(err);
          } else {
            resolve(result);
          };
        });
      });
    });
  };
};
function dbInsertManyMethod(dbFactory) {
  return function method(data) {
    return dbFactory(data)
  };
};

const insertManyFactory = dbInsertManyFactory(connection);
const insertMany = dbInsertManyMethod(insertManyFactory);

function dbUpdateOneFactory(connection) {
  return function factory(id, data) {
    return connection.then(client => {
      return new Promise((resolve, reject) => {
        client.db('tictactoe').collection('room').updateOne(id, data, (err, result) => {
          if (err) {
            reject(err);
          } else {
            resolve(result);
          };
        });
      });
    });
  };
};
function dbUpdateOneMethod(dbFactory) {
  return function method(id, data) {
    return dbFactory(id, data)
  };
};

const updateOneFactory = dbUpdateOneFactory(connection);
const updateOne = dbUpdateOneMethod(updateOneFactory);

function dbUpdateManyFactory(connection) {
  return function factory(id, data) {
    return connection.then(client => {
      return new Promise((resolve, reject) => {
        client.db('tictactoe').collection('room').updateMany(id, data, (err, result) => {
          if (err) {
            reject(err);
          } else {
            resolve(result);
          };
        });
      });
    });
  };
};
function dbUpdateManyMethod(dbFactory) {
  return function method(id, data) {
    return dbFactory(id, data)
  };
};

const updateManyFactory = dbUpdateManyFactory(connection);
const updateMany = dbUpdateManyMethod(updateManyFactory);

function dbDeleteOneFactory(connection) {
  return function factory(data) {
    return connection.then(client => {
      return new Promise((resolve, reject) => {
        client.db('tictactoe').collection('room').deleteOne(data, (err, result) => {
          if (err) {
            reject(err);
          } else {
            resolve(result);
          };
        });
      });
    });
  };
};
function dbDeleteOneMethod(dbFactory) {
  return function method(data) {
    return dbFactory(data)
  };
};

const deleteOneFactory = dbDeleteOneFactory(connection);
const deleteOne = dbDeleteOneMethod(deleteOneFactory);

function dbDeleteManyFactory(connection) {
  return function factory(data) {
    return connection.then(client => {
      return new Promise((resolve, reject) => {
        client.db('tictactoe').collection('room').deleteMany(data, (err, result) => {
          if (err) {
            reject(err);
          } else {
            resolve(result);
          };
        });
      });
    });
  };
};
function dbDeleteManyMethod(dbFactory) {
  return function method(data) {
    return dbFactory(data)
  };
};

const deleteManyFactory = dbDeleteManyFactory(connection);
const deleteMany = dbDeleteManyMethod(deleteManyFactory);

module.exports = {
  find,
  findOne,
  insertOne,
  insertMany,
  updateOne,
  updateMany,
  deleteOne,
  deleteMany
};