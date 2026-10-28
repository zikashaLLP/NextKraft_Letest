const User = require('./User');
const Project = require('./Project');
const Customer = require('./Customer');
const Operator = require('./Operator');
const ParkingSystem = require('./ParkingSystem');
const Car = require('./Car');
const PalletAllotment = require('./PalletAllotment');
const RequestQueue = require('./RequestQueue');
const Request = require('./Request');
const ParkingRequest = require('./ParkingRequest');
const ErrorLog = require('./ErrorLog');
const SystemLog = require('./SystemLog');
const CarAllotSyncLedger = require('./CarAllotSyncLedger');

// User associations
User.hasMany(Customer, { foreignKey: 'UserId', as: 'customers' });
User.hasMany(Car, { foreignKey: 'UserId', as: 'cars' });
User.hasMany(Operator, { foreignKey: 'UserId', as: 'operators' });
User.hasMany(RequestQueue, { foreignKey: 'UserId', as: 'requestQueues' });
User.hasMany(Request, { foreignKey: 'UserId', as: 'requests' });
User.hasMany(Customer, { foreignKey: 'ApprovedBy', as: 'approvedCustomers' });
User.hasMany(Operator, { foreignKey: 'ApprovedBy', as: 'approvedOperators' });

// Project associations
Project.hasMany(Customer, { foreignKey: 'ProjectId', as: 'customers' });
Project.hasMany(Operator, { foreignKey: 'ProjectId', as: 'operators' });
Project.hasMany(ParkingSystem, { foreignKey: 'ProjectId', as: 'parkingSystems' });
Project.hasMany(PalletAllotment, { foreignKey: 'ProjectId', as: 'palletAllotments' });
Project.hasMany(Request, { foreignKey: 'ProjectId', as: 'requests' });
Project.hasMany(RequestQueue, { foreignKey: 'ProjectId', as: 'requestQueues' });
Project.hasMany(ParkingRequest, { foreignKey: 'ProjectId', as: 'parkingRequests' });

// Customer associations
Customer.belongsTo(User, { foreignKey: 'UserId', as: 'user' });
Customer.belongsTo(Project, { foreignKey: 'ProjectId', as: 'project' });
Customer.belongsTo(ParkingSystem, { foreignKey: 'ParkingSystemId', as: 'parkingSystem' });
Customer.belongsTo(PalletAllotment, { foreignKey: 'PalletAllotmentId', as: 'palletAllotment' });
Customer.belongsTo(User, { foreignKey: 'ApprovedBy', as: 'approver' });

// Operator associations
Operator.belongsTo(User, { foreignKey: 'UserId', as: 'user' });
Operator.belongsTo(Project, { foreignKey: 'ProjectId', as: 'project' });
Operator.belongsTo(ParkingSystem, { foreignKey: 'ParkingSystemId', as: 'parkingSystem' });
Operator.belongsTo(User, { foreignKey: 'ApprovedBy', as: 'approver' });

// ParkingSystem associations
ParkingSystem.belongsTo(Project, { foreignKey: 'ProjectId', as: 'project' });
ParkingSystem.hasMany(Operator, { foreignKey: 'ParkingSystemId', as: 'operators' });
ParkingSystem.hasMany(Customer, { foreignKey: 'ParkingSystemId', as: 'customers' });
ParkingSystem.hasMany(PalletAllotment, { foreignKey: 'ParkingSystemId', as: 'palletAllotments' });
ParkingSystem.hasMany(Request, { foreignKey: 'ParkingSystemId', as: 'requests' });
ParkingSystem.hasMany(RequestQueue, { foreignKey: 'ParkingSystemId', as: 'requestQueues' });
ParkingSystem.hasMany(ParkingRequest, { foreignKey: 'ParkingSystemId', as: 'parkingRequests' });

// Car associations
Car.belongsTo(User, { foreignKey: 'UserId', as: 'user' });
Car.hasMany(PalletAllotment, { foreignKey: 'CarId', as: 'palletAllotments' });
Car.hasMany(ParkingRequest, { foreignKey: 'CarId', as: 'parkingRequests' });
Car.hasMany(Request, { foreignKey: 'CarId', as: 'requests' });
Car.hasMany(RequestQueue, { foreignKey: 'CarId', as: 'requestQueues' });

// PalletAllotment associations
PalletAllotment.belongsTo(Project, { foreignKey: 'ProjectId', as: 'project' });
PalletAllotment.belongsTo(ParkingSystem, { foreignKey: 'ParkingSystemId', as: 'parkingSystem' });
PalletAllotment.belongsTo(Car, { foreignKey: 'CarId', as: 'car' });
PalletAllotment.hasMany(RequestQueue, { foreignKey: 'PalletAllotmentId', as: 'requestQueues' });
PalletAllotment.hasMany(Request, { foreignKey: 'PalletAllotmentId', as: 'requests' });
PalletAllotment.hasMany(Customer, { foreignKey: 'PalletAllotmentId', as: 'customers' });

// ParkingRequest associations
ParkingRequest.belongsTo(User, { foreignKey: 'UserId', as: 'user' });
ParkingRequest.belongsTo(Project, { foreignKey: 'ProjectId', as: 'project' });
ParkingRequest.belongsTo(ParkingSystem, { foreignKey: 'ParkingSystemId', as: 'parkingSystem' });
ParkingRequest.belongsTo(Car, { foreignKey: 'CarId', as: 'car' });

// RequestQueue associations
RequestQueue.belongsTo(User, { foreignKey: 'UserId', as: 'user' });
RequestQueue.belongsTo(PalletAllotment, { foreignKey: 'PalletAllotmentId', as: 'palletAllotment' });
RequestQueue.belongsTo(Project, { foreignKey: 'ProjectId', as: 'project' });
RequestQueue.belongsTo(ParkingSystem, { foreignKey: 'ParkingSystemId', as: 'parkingSystem' });
RequestQueue.belongsTo(Car, { foreignKey: 'CarId', as: 'car' });

// Request associations
Request.belongsTo(User, { foreignKey: 'UserId', as: 'user' });
Request.belongsTo(PalletAllotment, { foreignKey: 'PalletAllotmentId', as: 'palletAllotment' });
Request.belongsTo(Project, { foreignKey: 'ProjectId', as: 'project' });
Request.belongsTo(ParkingSystem, { foreignKey: 'ParkingSystemId', as: 'parkingSystem' });
Request.belongsTo(Car, { foreignKey: 'CarId', as: 'car' });

module.exports = {
  User,
  Project,
  Customer,
  Operator,
  ParkingSystem,
  Car,
  PalletAllotment,
  RequestQueue,
  Request,
  ParkingRequest,
  ErrorLog,
  SystemLog,
  CarAllotSyncLedger
};

