const { Op } = require('sequelize');
const notificationService = require('./notification.service');
const websocketService = require('./websocket.service');
const { User, Customer, Operator, Car, ParkingRequest, Project, ParkingSystem, PalletAllotment } = require('../models/associations');

const getISTTime = () => {
  const now = new Date();
  const utcTime = now.getTime();
  const istOffset = 5.5 * 60 * 60 * 1000;
  return new Date(utcTime + istOffset);
};

// Customer raises a parking request for a specific car
const createParkingRequest = async (userId, carId) => {
  // Validate car belongs to the user
  const car = await Car.findOne({
    where: { Id: carId, UserId: userId }
  });
  if (!car) {
    throw new Error('Car not found for this user');
  }

  // Check if car is already parked (assigned to a pallet)
  const parkedPallet = await PalletAllotment.findOne({
    where: {
      UserId: userId,
      CarId: carId,
      Status: 'Assigned'
    }
  });

  if (parkedPallet) {
    throw new Error('This car is already parked. Please release the car first before creating a new parking request.');
  }

  // Check if there's already an active parking request for this car
  const existingParkingRequest = await ParkingRequest.findOne({
    where: {
      CarId: carId,
      UserId: userId,
      Status: { [Op.notIn]: ['Completed', 'Cancelled'] }
    }
  });

  if (existingParkingRequest) {
    throw new Error('An active parking request already exists for this car. Please wait for the current request to be completed or cancelled.');
  }

  // Fetch customer profile to get project/parking system
  const customer = await Customer.findOne({
    where: { UserId: userId }
  });
  if (!customer) {
    throw new Error('Customer profile not found');
  }

  // Validate customer has project and parking system assigned
  if (!customer.ProjectId || !customer.ParkingSystemId) {
    throw new Error('Customer is not assigned to a project and parking system');
  }

  // Find operator assigned to same project and parking system (approved) for notification
  const operator = await Operator.findOne({
    where: {
      ProjectId: customer.ProjectId,
      ParkingSystemId: customer.ParkingSystemId,
      Status: 'Approved'
    },
    include: [
      {
        model: User,
        as: 'user',
        attributes: ['Id', 'Username']
      }
    ]
  });

  const istTime = getISTTime();

  const parkingRequest = await ParkingRequest.create({
    UserId: userId,
    ProjectId: customer.ProjectId,
    ParkingSystemId: customer.ParkingSystemId,
    CarId: car.Id,
    Status: 'Pending',
    CreatedAt: istTime,
    UpdatedAt: istTime
  });

  // Reload with associations for detailed response
  await parkingRequest.reload({
    include: [
      {
        model: User,
        as: 'user',
        attributes: ['Id', 'Username', 'Role']
      },
      {
        model: Project,
        as: 'project',
        attributes: ['Id', 'ProjectName', 'SocietyName']
      },
      {
        model: ParkingSystem,
        as: 'parkingSystem',
        attributes: ['Id', 'WingName', 'Type', 'Level', 'Column']
      },
      {
        model: Car,
        as: 'car',
        attributes: ['Id', 'UserId', 'CarType', 'CarModel', 'CarCompany', 'CarNumber']
      }
    ]
  });

  // Notify operator (if operator exists for this project/parking system)
  if (operator && operator.user) {
    const carInfo = parkingRequest.car
      ? `${parkingRequest.car.CarCompany} ${parkingRequest.car.CarModel} (${parkingRequest.car.CarNumber})`
      : 'a car';
    await notificationService.notifyParkingRequestCreated(operator.user.Id, {
      body: `New parking request for ${carInfo}`,
      data: {
        parkingRequestId: parkingRequest.Id.toString(),
        userId: userId.toString(),
        carId: parkingRequest.CarId.toString()
      }
    });

    // Emit WebSocket event for real-time update to operator
    websocketService.emitToUser(operator.user.Id, 'new_parking_request', {
      id: parkingRequest.Id,
      userId: parkingRequest.userId,
      user: parkingRequest.user ? {
        id: parkingRequest.user.Id,
        username: parkingRequest.user.Username,
        role: parkingRequest.user.Role
      } : null,
      projectId: parkingRequest.ProjectId,
      parkingSystemId: parkingRequest.ParkingSystemId,
      carId: parkingRequest.CarId,
      car: parkingRequest.car ? {
        id: parkingRequest.car.Id,
        userId: parkingRequest.car.UserId,
        carType: parkingRequest.car.CarType,
        carModel: parkingRequest.car.CarModel,
        carCompany: parkingRequest.car.CarCompany,
        carNumber: parkingRequest.car.CarNumber
      } : null,
      status: parkingRequest.Status,
      createdAt: parkingRequest.CreatedAt,
      updatedAt: parkingRequest.UpdatedAt
    });
  }

  return {
    id: parkingRequest.Id,
    userId: parkingRequest.UserId,
    user: parkingRequest.user ? {
      id: parkingRequest.user.Id,
      username: parkingRequest.user.Username,
      role: parkingRequest.user.Role
    } : null,
    projectId: parkingRequest.ProjectId,
    parkingSystemId: parkingRequest.ParkingSystemId,
    carId: parkingRequest.CarId,
    project: parkingRequest.project ? {
      id: parkingRequest.project.Id,
      projectName: parkingRequest.project.ProjectName,
      societyName: parkingRequest.project.SocietyName
    } : null,
    parkingSystem: parkingRequest.parkingSystem ? {
      id: parkingRequest.parkingSystem.Id,
      wingName: parkingRequest.parkingSystem.WingName,
      type: parkingRequest.parkingSystem.Type,
      level: parkingRequest.parkingSystem.Level,
      column: parkingRequest.parkingSystem.Column
    } : null,
    car: parkingRequest.car ? {
      id: parkingRequest.car.Id,
      userId: parkingRequest.car.UserId,
      carType: parkingRequest.car.CarType,
      carModel: parkingRequest.car.CarModel,
      carCompany: parkingRequest.car.CarCompany,
      carNumber: parkingRequest.car.CarNumber
    } : null,
    status: parkingRequest.Status,
    createdAt: parkingRequest.CreatedAt,
    updatedAt: parkingRequest.UpdatedAt
  };
};

// Operator fetches parking requests assigned to them
const getOperatorParkingRequests = async (operatorUserId) => {
  const operator = await Operator.findOne({ where: { UserId: operatorUserId } });
  if (!operator) {
    throw new Error('Operator profile not found');
  }

  // Validate operator has project and parking system assigned
  if (!operator.ProjectId || !operator.ParkingSystemId) {
    throw new Error('Operator is not assigned to a project and parking system');
  }

  const requests = await ParkingRequest.findAll({
    where: {
      ProjectId: operator.ProjectId,
      ParkingSystemId: operator.ParkingSystemId
    },
    include: [
      {
        model: User,
        as: 'user',
        attributes: ['Id', 'Username', 'Role']
      },
      {
        model: Car,
        as: 'car',
        attributes: ['Id', 'UserId', 'CarType', 'CarModel', 'CarCompany', 'CarNumber']
      }
    ],
    order: [['CreatedAt', 'DESC']]
  });

  return requests.map(req => ({
    id: req.Id,
    userId: req.UserId,
    user: req.user ? {
      id: req.user.Id,
      username: req.user.Username,
      role: req.user.Role
    } : null,
    projectId: req.ProjectId,
    parkingSystemId: req.ParkingSystemId,
    carId: req.CarId,
    car: req.car ? {
      id: req.car.Id,
      userId: req.car.UserId,
      carType: req.car.CarType,
      carModel: req.car.CarModel,
      carCompany: req.car.CarCompany,
      carNumber: req.car.CarNumber
    } : null,
    status: req.Status,
    createdAt: req.CreatedAt,
    updatedAt: req.UpdatedAt
  }));
};

/**
 * Update parking request status.
 * - operator: existing transitions within their project + parking system
 * - customer: only Cancelled, and only while status is Pending, on own request
 */
const updateParkingRequestStatus = async (actorUserId, parkingRequestId, newStatus, actorRole = 'operator') => {
  let parkingRequest;

  if (actorRole === 'customer') {
    if (newStatus !== 'Cancelled') {
      throw new Error('Customers can only cancel a pending parking request');
    }

    parkingRequest = await ParkingRequest.findOne({
      where: {
        Id: parkingRequestId,
        UserId: actorUserId
      }
    });

    if (!parkingRequest) {
      throw new Error('Parking request not found or not assigned to you');
    }

    if (parkingRequest.Status !== 'Pending') {
      throw new Error('Customers can only cancel a parking request while it is Pending');
    }
  } else {
    const operator = await Operator.findOne({ where: { UserId: actorUserId } });
    if (!operator) {
      throw new Error('Operator profile not found');
    }

    if (!operator.ProjectId || !operator.ParkingSystemId) {
      throw new Error('Operator is not assigned to a project and parking system');
    }

    parkingRequest = await ParkingRequest.findOne({
      where: {
        Id: parkingRequestId,
        ProjectId: operator.ProjectId,
        ParkingSystemId: operator.ParkingSystemId
      }
    });

    if (!parkingRequest) {
      throw new Error('Parking request not found or not assigned to you');
    }

    const validTransitions = {
      Pending: ['Accepted', 'Queued', 'Completed', 'Cancelled'],
      Accepted: ['Queued', 'Completed', 'Cancelled'],
      Queued: ['Completed', 'Cancelled'],
      Completed: [],
      Cancelled: []
    };

    if (!validTransitions[parkingRequest.Status] || !validTransitions[parkingRequest.Status].includes(newStatus)) {
      throw new Error(`Invalid status transition from ${parkingRequest.Status} to ${newStatus}`);
    }
  }

  const istTime = getISTTime();

  await parkingRequest.update({
    Status: newStatus,
    UpdatedAt: istTime
  });

  const statusData = {
    parkingRequestId: parkingRequest.Id.toString(),
    status: newStatus
  };

  if (actorRole === 'operator') {
    // Notify customer (accepted / rejected / other status)
    if (newStatus === 'Accepted') {
      await notificationService.notifyParkingRequestAccepted(parkingRequest.UserId, {
        body: 'Your parking request has been accepted by the operator.',
        data: statusData
      });
    } else if (newStatus === 'Cancelled') {
      await notificationService.notifyParkingRequestRejected(parkingRequest.UserId, {
        body: 'Your parking request has been rejected.',
        data: statusData
      });
    } else {
      await notificationService.sendToUser({
        userId: parkingRequest.UserId,
        title: 'Parking Request Status Updated',
        body: `Your parking request status is now ${newStatus}`,
        type: notificationService.NOTIFICATION_TYPES.PARKING_REQUEST_STATUS_UPDATE,
        data: statusData
      });
    }

    websocketService.emitToUser(parkingRequest.UserId, 'parking_request_status_changed', {
      parkingRequestId: parkingRequest.Id,
      status: newStatus,
      updatedAt: istTime
    });
  } else {
    // Customer cancelled a Pending request — notify operator for live refresh
    const operator = await Operator.findOne({
      where: {
        ProjectId: parkingRequest.ProjectId,
        ParkingSystemId: parkingRequest.ParkingSystemId
      },
      include: [{ model: User, as: 'user', attributes: ['Id', 'Username', 'Role'] }]
    });

    if (operator?.user) {
      await notificationService.sendToUser({
        userId: operator.user.Id,
        title: 'Parking Request Cancelled',
        body: 'A customer cancelled their pending parking request.',
        type: notificationService.NOTIFICATION_TYPES.PARKING_REQUEST_STATUS_UPDATE,
        data: statusData
      });

      websocketService.emitToUser(operator.user.Id, 'parking_request_status_changed', {
        parkingRequestId: parkingRequest.Id,
        status: newStatus,
        updatedAt: istTime,
        cancelledBy: 'customer'
      });
    }

    websocketService.emitToUser(parkingRequest.UserId, 'parking_request_status_changed', {
      parkingRequestId: parkingRequest.Id,
      status: newStatus,
      updatedAt: istTime,
      cancelledBy: 'customer'
    });
  }

  return {
    id: parkingRequest.Id,
    userId: parkingRequest.UserId,
    projectId: parkingRequest.ProjectId,
    parkingSystemId: parkingRequest.ParkingSystemId,
    carId: parkingRequest.CarId,
    status: parkingRequest.Status,
    createdAt: parkingRequest.CreatedAt,
    updatedAt: parkingRequest.UpdatedAt
  };
};

module.exports = {
  createParkingRequest,
  getOperatorParkingRequests,
  updateParkingRequestStatus
};


