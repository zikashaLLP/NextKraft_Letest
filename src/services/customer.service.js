const { Op } = require('sequelize');
const { User, Customer, ParkingSystem, Project, Car, PalletAllotment, Request, Operator, ParkingRequest } = require('../models/associations');
const websocketService = require('./websocket.service');
const { calculateTowerReleaseEstimatedTime, calculateCustomerTowerReleaseQueueEstimate } = require('../utils/towerTiming');
const { formatEstimatedTimeInMinutes } = require('../utils/timeFormat');

// Helper function to get IST time
const getISTTime = () => {
  const now = new Date();
  // IST is UTC+5:30
  // Get UTC time in milliseconds
  const utcTime = now.getTime();
  // IST offset is +5:30 (5 hours 30 minutes = 19800000 milliseconds)
  const istOffset = 5.5 * 60 * 60 * 1000;
  // Create IST time
  const istTime = new Date(utcTime + istOffset);
  return istTime;
};

// Create Customer Service
const createCustomer = async (customerData) => {
  // Step 1: Create user first
  // Check if user already exists
  const existingUser = await User.findOne({ where: { Username: customerData.Username } });
  
  if (existingUser) {
    throw new Error('Username already exists');
  }

  // Create new user with customer role
  const user = await User.create({
    Username: customerData.Username,
    Password: customerData.Password,
    Role: 'customer'
  });

  const userId = user.Id;

  // Step 2: Validate parking system exists (if provided)
  let projectId = null;
  if (customerData.ParkingSystemId) {
    const parkingSystem = await ParkingSystem.findByPk(customerData.ParkingSystemId);
    if (!parkingSystem) {
      // Rollback: delete the created user
      await user.destroy();
      throw new Error('Parking system not found');
    }
    projectId = parkingSystem.ProjectId;
  } else if (customerData.ProjectId) {
    // Validate project exists if provided directly
    const project = await Project.findByPk(customerData.ProjectId);
    if (!project) {
      // Rollback: delete the created user
      await user.destroy();
      throw new Error('Project not found');
    }
    projectId = customerData.ProjectId;
  } else {
    // Rollback: delete the created user if no project/parking system provided
    await user.destroy();
    throw new Error('Either parkingSystemId or projectId is required');
  }

  // Step 3: Determine status and approval details based on admin role
  let status = 'Pending';
  let approvedBy = null;
  let approvedAt = null;

  // Step 4: Get IST time for CreatedAt and UpdatedAt
  const istTime = getISTTime();
  
  // Step 5: Create customer record
  const customer = await Customer.create({
    UserId: userId,
    FirstName: customerData.FirstName,
    LastName: customerData.LastName,
    Email: customerData.Email,
    MobileNumber: customerData.MobileNumber,
    ParkingSystemId: customerData.ParkingSystemId,
    ProjectId: projectId,
    FlatNumber: customerData.FlatNumber,
    Profession: customerData.Profession,
    Status: status,
    ApprovedBy: approvedBy,
    ApprovedAt: approvedAt,
    CreatedAt: istTime,
    UpdatedAt: istTime
  });

  return {
    user: {
      id: user.Id,
      username: user.Username,
      role: user.Role,
      createdAt: user.CreatedAt,
      updatedAt: user.UpdatedAt
    },
    customer: {
    id: customer.Id,
      userId: customer.UserId,
    firstName: customer.FirstName,
    lastName: customer.LastName,
    email: customer.Email,
    mobileNumber: customer.MobileNumber,
      projectId: customer.ProjectId,
    parkingSystemId: customer.ParkingSystemId,
      flatNumber: customer.FlatNumber,
      profession: customer.Profession,
      status: customer.Status,
      approvedBy: customer.ApprovedBy,
      approvedAt: customer.ApprovedAt,
      createdAt: customer.CreatedAt,
      updatedAt: customer.UpdatedAt
    }
  };
};

// Get Customer Profile Service
const getCustomerProfile = async (userId) => {
  // Find customer by userId
  const customer = await Customer.findOne({
    where: { UserId: userId },
    include: [
      {
        model: User,
        as: 'user',
        attributes: ['Id', 'Username', 'Role', 'CreatedAt', 'UpdatedAt']
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
      }
    ]
  });

  if (!customer) {
    throw new Error('Customer profile not found');
  }

  return {
    user: {
      id: customer.user.Id,
      username: customer.user.Username,
      role: customer.user.Role,
      createdAt: customer.user.CreatedAt,
      updatedAt: customer.user.UpdatedAt
    },
    customer: {
      id: customer.Id,
      userId: customer.UserId,
      firstName: customer.FirstName,
      lastName: customer.LastName,
      email: customer.Email,
      mobileNumber: customer.MobileNumber,
    projectId: customer.ProjectId,
      project: customer.project ? {
        id: customer.project.Id,
        projectName: customer.project.ProjectName,
        societyName: customer.project.SocietyName
      } : null,
      parkingSystemId: customer.ParkingSystemId,
      parkingSystem: customer.parkingSystem ? {
        id: customer.parkingSystem.Id,
        wingName: customer.parkingSystem.WingName,
        type: customer.parkingSystem.Type,
        level: customer.parkingSystem.Level,
        column: customer.parkingSystem.Column
      } : null,
    flatNumber: customer.FlatNumber,
    profession: customer.Profession,
    status: customer.Status,
      approvedBy: customer.ApprovedBy,
      approvedAt: customer.ApprovedAt,
    createdAt: customer.CreatedAt,
    updatedAt: customer.UpdatedAt
    }
  };
};

// Create Car Service
const createCar = async (carData) => {
  // Enforce unique car number (global uniqueness assumed)
  const existing = await Car.findOne({ where: { CarNumber: carData.CarNumber } });
  if (existing) {
    throw new Error('Car number already exists');
  }

  // Get IST time for CreatedAt and UpdatedAt
  const istTime = getISTTime();

  // Create new car
  const car = await Car.create({
    UserId: carData.UserId,
    CarType: carData.CarType,
    CarModel: carData.CarModel,
    CarCompany: carData.CarCompany,
    CarNumber: carData.CarNumber,
    CreatedAt: istTime,
    UpdatedAt: istTime
  });

  return {
    id: car.Id,
    userId: car.UserId,
    carType: car.CarType,
    carModel: car.CarModel,
    carCompany: car.CarCompany,
    carNumber: car.CarNumber,
    createdAt: car.CreatedAt,
    updatedAt: car.UpdatedAt
  };
};

// Get Car List Service
const getCarList = async (userId) => {
  // Find all cars for the user
  const cars = await Car.findAll({
    where: { UserId: userId },
    order: [['CreatedAt', 'DESC']]
  });

  if (cars.length === 0) {
    return [];
  }

  // Get all car IDs
  const carIds = cars.map(car => car.Id);

  // Fetch latest requests for each car (not Cancelled or Completed)
  const allRequests = await Request.findAll({
    where: {
      CarId: { [Op.in]: carIds },
      Status: { [Op.notIn]: ['Cancelled', 'Completed'] }
    },
    include: [
      {
        model: Project,
        as: 'project',
        attributes: ['Id', 'ProjectName', 'SocietyName']
      },
      {
        model: ParkingSystem,
        as: 'parkingSystem',
        attributes: ['Id', 'WingName', 'Type', 'Level', 'Column', 'TimeForEachLevel', 'TimeForHorizontalMove', 'BufferTime']
      },
      {
        model: Car,
        as: 'car',
        attributes: ['Id', 'CarType', 'CarModel', 'CarCompany', 'CarNumber']
      },
      {
        model: PalletAllotment,
        as: 'palletAllotment',
        attributes: ['Id', 'Level', 'LevelBelowGround', 'Column', 'UserGivenPalletNumber', 'Status']
      }
    ],
    order: [['CreatedAt', 'DESC']]
  });

  // Group requests by CarId and take the latest one for each car
  const requestsMap = new Map();
  allRequests.forEach(request => {
    if (!requestsMap.has(request.CarId)) {
      requestsMap.set(request.CarId, request);
    }
  });

  // Fetch latest parking requests for each car (not Cancelled or Completed)
  const allParkingRequests = await ParkingRequest.findAll({
    where: {
      CarId: { [Op.in]: carIds },
      Status: { [Op.notIn]: ['Cancelled', 'Completed'] }
    },
    include: [
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
        attributes: ['Id', 'CarType', 'CarModel', 'CarCompany', 'CarNumber']
      }
    ],
    order: [['CreatedAt', 'DESC']]
  });

  // Group parking requests by CarId and take the latest one for each car
  const parkingRequestsMap = new Map();
  allParkingRequests.forEach(parkingRequest => {
    if (!parkingRequestsMap.has(parkingRequest.CarId)) {
      parkingRequestsMap.set(parkingRequest.CarId, parkingRequest);
    }
  });

  // Fetch assigned pallets for each car
  const assignedPallets = await PalletAllotment.findAll({
    where: {
      CarId: { [Op.in]: carIds },
      Status: 'Assigned'
    },
    include: [
      {
        model: Project,
        as: 'project',
        attributes: ['Id', 'ProjectName', 'SocietyName']
      },
      {
        model: ParkingSystem,
        as: 'parkingSystem',
        attributes: ['Id', 'WingName', 'Type', 'Level', 'Column', 'TotalNumberOfPallet']
      },
      {
        model: Car,
        as: 'car',
        attributes: ['Id', 'CarType', 'CarModel', 'CarCompany', 'CarNumber']
      }
    ]
  });

  // Group pallets by CarId (should be only one per car, but we'll take the first one)
  const palletsMap = new Map();
  assignedPallets.forEach(pallet => {
    if (!palletsMap.has(pallet.CarId)) {
      palletsMap.set(pallet.CarId, pallet);
    }
  });

  // Helper function to calculate estimated time (same logic as requestCarRelease)
  const calculateEstimatedTime = (palletAllotment, parkingSystem) => {
    if (!palletAllotment || !parkingSystem) {
      return null;
    }

    let estimatedTime = 0;

    if (parkingSystem.Type === 'Tower') {
      // Customer pending estimate: ground, no pallet on lift → target → ground
      estimatedTime = calculateTowerReleaseEstimatedTime({
        targetFloor: palletAllotment.Level,
        currentFloor: 0,
        palletFloor: 0,
        hasPalletOnLift: false,
      });
    } else if (parkingSystem.Type === 'Puzzle') {
      // For Puzzle: Calculate based on pallet location
      if (palletAllotment.Level !== null && palletAllotment.Level !== undefined && palletAllotment.LevelBelowGround === null) {
        // Pallet has Level and Column (above ground)
        // Time = (Level * TimePerLevel) + HorizontalMoveTime + BufferTime
        // HorizontalMoveTime is NOT applicable for Level 1
        estimatedTime = (palletAllotment.Level * parkingSystem.TimeForEachLevel) + 
                       (palletAllotment.Level > 1 ? parkingSystem.TimeForHorizontalMove : 0) + 
                       (parkingSystem.BufferTime || 0);
      } else if (palletAllotment.LevelBelowGround !== null && palletAllotment.LevelBelowGround !== undefined) {
        // Pallet has LevelBelowGround and Column (below ground)
        if (palletAllotment.LevelBelowGround === 1) {
          // LevelBelowGround 1: Only (LevelBelowGround * TimePerLevel) + BufferTime
          estimatedTime = (palletAllotment.LevelBelowGround * parkingSystem.TimeForEachLevel) + (parkingSystem.BufferTime || 0);
        } else {
          // LevelBelowGround > 1: (LevelBelowGround * TimePerLevel) + ((LevelBelowGround * TimePerLevel) + HorizontalMoveTime + BufferTime)
          estimatedTime = (palletAllotment.LevelBelowGround * parkingSystem.TimeForEachLevel) + 
                         ((palletAllotment.LevelBelowGround * parkingSystem.TimeForEachLevel) + 
                          parkingSystem.TimeForHorizontalMove + 
                          (parkingSystem.BufferTime || 0));
        }
      } else {
        // Invalid pallet location information
        return null;
      }
    } else {
      // Invalid parking system type
      return null;
    }

    return estimatedTime;
  };

  // Map cars with their associated data
  return cars.map(car => {
    const request = requestsMap.get(car.Id) || null;
    const parkingRequest = parkingRequestsMap.get(car.Id) || null;
    const pallet = palletsMap.get(car.Id) || null;

    // Pending/Queued: fresh mechanical estimate. Accepted+: keep stored ETA from accept (for countdown).
    let calculatedEstimatedTime = null;
    const isAcceptedOrLater =
      request &&
      (request.Status === 'Accepted' || request.Status === 'Completed' || request.Status === 'Cancelled');
    if (request && !isAcceptedOrLater && request.palletAllotment && request.parkingSystem) {
      calculatedEstimatedTime = calculateEstimatedTime(request.palletAllotment, request.parkingSystem);
    }
    const requestEstimatedTime =
      calculatedEstimatedTime !== null ? calculatedEstimatedTime : request?.EstimatedTime;

    return {
      id: car.Id,
      userId: car.UserId,
      carType: car.CarType,
      carModel: car.CarModel,
      carCompany: car.CarCompany,
      carNumber: car.CarNumber,
      request: request ? {
        id: request.Id,
        userId: request.UserId,
        palletAllotmentId: request.PalletAllotmentId,
        projectId: request.ProjectId,
        parkingSystemId: request.ParkingSystemId,
        carId: request.CarId,
        project: request.project ? {
          id: request.project.Id,
          projectName: request.project.ProjectName,
          societyName: request.project.SocietyName
        } : null,
        parkingSystem: request.parkingSystem ? {
          id: request.parkingSystem.Id,
          wingName: request.parkingSystem.WingName,
          type: request.parkingSystem.Type,
          level: request.parkingSystem.Level,
          column: request.parkingSystem.Column
        } : null,
        car: request.car ? {
          id: request.car.Id,
          carType: request.car.CarType,
          carModel: request.car.CarModel,
          carCompany: request.car.CarCompany,
          carNumber: request.car.CarNumber
        } : null,
        palletAllotment: request.palletAllotment ? {
          id: request.palletAllotment.Id,
          level: request.palletAllotment.Level,
          levelBelowGround: request.palletAllotment.LevelBelowGround,
          column: request.palletAllotment.Column,
          userGivenPalletNumber: request.palletAllotment.UserGivenPalletNumber,
          status: request.palletAllotment.Status
        } : null,
        status: request.Status,
        estimatedTime: requestEstimatedTime,
        estimatedTimeFormatted: requestEstimatedTime
          ? formatEstimatedTimeInMinutes(requestEstimatedTime)
          : null,
        createdAt: request.CreatedAt,
        updatedAt: request.UpdatedAt
      } : null,
      parkingRequest: parkingRequest ? {
        id: parkingRequest.Id,
        userId: parkingRequest.UserId,
        projectId: parkingRequest.ProjectId,
        parkingSystemId: parkingRequest.ParkingSystemId,
        carId: parkingRequest.CarId,
        status: parkingRequest.Status,
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
          carType: parkingRequest.car.CarType,
          carModel: parkingRequest.car.CarModel,
          carCompany: parkingRequest.car.CarCompany,
          carNumber: parkingRequest.car.CarNumber
        } : null,
        createdAt: parkingRequest.CreatedAt,
        updatedAt: parkingRequest.UpdatedAt
      } : null,
      pallet: pallet ? {
        id: pallet.Id,
        userId: pallet.UserId,
        projectId: pallet.ProjectId,
        parkingSystemId: pallet.ParkingSystemId,
        level: pallet.Level,
        levelBelowGround: pallet.LevelBelowGround,
        column: pallet.Column,
        userGivenPalletNumber: pallet.UserGivenPalletNumber,
        carId: pallet.CarId,
        status: pallet.Status,
        project: pallet.project ? {
          id: pallet.project.Id,
          projectName: pallet.project.ProjectName,
          societyName: pallet.project.SocietyName
        } : null,
        parkingSystem: pallet.parkingSystem ? {
          id: pallet.parkingSystem.Id,
          wingName: pallet.parkingSystem.WingName,
          type: pallet.parkingSystem.Type,
          level: pallet.parkingSystem.Level,
          column: pallet.parkingSystem.Column,
          totalNumberOfPallet: pallet.parkingSystem.TotalNumberOfPallet
        } : null,
        car: pallet.car ? {
          id: pallet.car.Id,
          carType: pallet.car.CarType,
          carModel: pallet.car.CarModel,
          carCompany: pallet.car.CarCompany,
          carNumber: pallet.car.CarNumber
        } : null,
        createdAt: pallet.CreatedAt,
        updatedAt: pallet.UpdatedAt
      } : null,
      createdAt: car.CreatedAt,
      updatedAt: car.UpdatedAt
    };
  });
};

// Get Available Car List Service (cars that are not parked/assigned)
const getAvailableCarList = async (userId) => {
  // Find all cars for the user
  const allCars = await Car.findAll({
    where: { UserId: userId },
    order: [['CreatedAt', 'DESC']]
  });

  // Get carIds that are currently parked (Assigned pallets)
  const parkedCars = await PalletAllotment.findAll({
    where: {
      UserId: userId,
      Status: 'Assigned'
    },
    attributes: ['CarId'],
    raw: true
  });

  const parkedCarIds = parkedCars
    .map(p => p.CarId)
    .filter(carId => carId !== null);

  // Get carIds that have active (non-completed and non-cancelled) parking requests
  const activeParkingRequests = await ParkingRequest.findAll({
    where: {
      UserId: userId,
      Status: { [Op.notIn]: ['Completed', 'Cancelled'] }
    },
    attributes: ['CarId'],
    raw: true
  });

  const parkingRequestCarIds = activeParkingRequests
    .map(req => req.CarId)
    .filter(carId => carId !== null);

  // Combine parked and active parking-request car IDs to exclude
  const excludedCarIds = new Set([...parkedCarIds, ...parkingRequestCarIds]);

  // Filter out cars that are parked or have an active request
  const availableCars = allCars.filter(car => !excludedCarIds.has(car.Id));

  return availableCars.map(car => ({
    id: car.Id,
    userId: car.UserId,
    carType: car.CarType,
    carModel: car.CarModel,
    carCompany: car.CarCompany,
    carNumber: car.CarNumber,
    createdAt: car.CreatedAt,
    updatedAt: car.UpdatedAt
  }));
};

// Get Customer Pallet Status Service
const getCustomerPalletStatus = async (userId) => {
  // Find all pallets assigned to the customer
  const pallets = await PalletAllotment.findAll({
    where: {
      UserId: userId,
      Status: 'Assigned'
    },
    include: [
      {
        model: Car,
        as: 'car',
        attributes: ['Id', 'CarType', 'CarModel', 'CarCompany', 'CarNumber'],
        include: [
          {
            model: User,
            as: 'user',
            attributes: ['Id', 'Username']
          }
        ]
      },
      {
        model: Project,
        as: 'project',
        attributes: ['Id', 'ProjectName', 'SocietyName']
      },
      {
        model: ParkingSystem,
        as: 'parkingSystem',
        attributes: ['Id', 'WingName', 'Type', 'Level', 'Column', 'TotalNumberOfPallet']
      }
    ],
    order: [['CreatedAt', 'DESC']]
  });

  // Get all pallet IDs
  const palletIds = pallets.map(pallet => pallet.Id);

  // Get latest request for each pallet (not completed)
  const requestsMap = new Map();
  if (palletIds.length > 0) {
    // Get all requests for these pallets that are not completed, ordered by CreatedAt DESC
    const allRequests = await Request.findAll({
      where: {
        PalletAllotmentId: { [Op.in]: palletIds },
        Status: { [Op.notIn]: [ 'Completed', 'Cancelled' ] }
      },
      include: [
        {
          model: Project,
          as: 'project',
          attributes: ['Id', 'ProjectName', 'SocietyName']
        },
        {
          model: ParkingSystem,
          as: 'parkingSystem',
          attributes: ['Id', 'WingName', 'Type']
        },
        {
          model: Car,
          as: 'car',
          attributes: ['Id', 'CarType', 'CarModel', 'CarCompany', 'CarNumber']
        }
      ],
      order: [['CreatedAt', 'DESC']]
    });

    // Group by PalletAllotmentId and take the first (latest) one for each pallet
    allRequests.forEach(request => {
      if (!requestsMap.has(request.PalletAllotmentId)) {
        requestsMap.set(request.PalletAllotmentId, request);
      }
    });
  }

  // Calculate waiting number for each request
  // Get unique ProjectId and ParkingSystemId combinations from the requests
  const projectParkingSystemKeys = Array.from(requestsMap.values())
    .map(req => req.ProjectId && req.ParkingSystemId ? `${req.ProjectId}_${req.ParkingSystemId}` : null)
    .filter(key => key !== null);

  // Get all non-completed requests for these project/parking system combinations to calculate waiting numbers
  const allProjectParkingSystemRequests = projectParkingSystemKeys.length > 0 ? await Request.findAll({
    where: {
      Status: { [Op.notIn]: [ 'Completed', 'Cancelled' ] }
    },
    attributes: ['Id', 'ProjectId', 'ParkingSystemId', 'CreatedAt'],
    order: [['CreatedAt', 'ASC']]
  }) : [];

  // Filter to only include requests matching our project/parking system combinations
  const filteredRequests = allProjectParkingSystemRequests.filter(req => {
    const key = `${req.ProjectId}_${req.ParkingSystemId}`;
    return projectParkingSystemKeys.includes(key);
  });

  // Group requests by ProjectId and ParkingSystemId combination
  const requestsByProjectParkingSystem = new Map();
  filteredRequests.forEach(req => {
    const key = `${req.ProjectId}_${req.ParkingSystemId}`;
    if (!requestsByProjectParkingSystem.has(key)) {
      requestsByProjectParkingSystem.set(key, []);
    }
    requestsByProjectParkingSystem.get(key).push(req);
  });

  // Calculate waiting number for each request
  const waitingNumbersMap = new Map();
  requestsMap.forEach((request, palletId) => {
    if (request && request.ProjectId && request.ParkingSystemId) {
      const key = `${request.ProjectId}_${request.ParkingSystemId}`;
      const projectParkingSystemRequests = requestsByProjectParkingSystem.get(key) || [];
      // Count requests created before this request
      const waitingNumber = projectParkingSystemRequests.filter(req => 
        req.CreatedAt < request.CreatedAt
      ).length;
      waitingNumbersMap.set(palletId, waitingNumber);
    } else {
      waitingNumbersMap.set(palletId, null);
    }
  });

  const palletsData = pallets.map(pallet => {
    const request = requestsMap.get(pallet.Id);
    const waitingNumber = waitingNumbersMap.get(pallet.Id);
    
    return {
      id: pallet.Id,
      userId: pallet.UserId,
      projectId: pallet.ProjectId,
      parkingSystemId: pallet.ParkingSystemId,
      level: pallet.Level,
      column: pallet.Column,
      userGivenPalletNumber: pallet.UserGivenPalletNumber,
      carId: pallet.CarId,
      car: pallet.car ? {
        id: pallet.car.Id,
        carType: pallet.car.CarType,
        carModel: pallet.car.CarModel,
        carCompany: pallet.car.CarCompany,
        carNumber: pallet.car.CarNumber,
        user: pallet.car.user ? {
          id: pallet.car.user.Id,
          username: pallet.car.user.Username
        } : null
      } : null,
      status: pallet.Status,
      project: pallet.project ? {
        id: pallet.project.Id,
        projectName: pallet.project.ProjectName,
        societyName: pallet.project.SocietyName
      } : null,
      parkingSystem: pallet.parkingSystem ? {
        id: pallet.parkingSystem.Id,
        wingName: pallet.parkingSystem.WingName,
        type: pallet.parkingSystem.Type,
        level: pallet.parkingSystem.Level,
        column: pallet.parkingSystem.Column,
        totalNumberOfPallet: pallet.parkingSystem.TotalNumberOfPallet
      } : null,
      request: request ? {
        id: request.Id,
        userId: request.UserId,
        palletAllotmentId: request.PalletAllotmentId,
        projectId: request.ProjectId,
        parkingSystemId: request.ParkingSystemId,
        carId: request.CarId,
        project: request.project ? {
          id: request.project.Id,
          projectName: request.project.ProjectName,
          societyName: request.project.SocietyName
        } : null,
        parkingSystem: request.parkingSystem ? {
          id: request.parkingSystem.Id,
          wingName: request.parkingSystem.WingName,
          type: request.parkingSystem.Type
        } : null,
        car: request.car ? {
          id: request.car.Id,
          carType: request.car.CarType,
          carModel: request.car.CarModel,
          carCompany: request.car.CarCompany,
          carNumber: request.car.CarNumber
        } : null,
        status: request.Status,
        estimatedTime: request.EstimatedTime,
        estimatedTimeFormatted: formatEstimatedTimeInMinutes(request.EstimatedTime),
        waitingNumber: waitingNumber !== null && waitingNumber !== undefined ? waitingNumber : null,
        createdAt: request.CreatedAt,
        updatedAt: request.UpdatedAt
      } : null,
      createdAt: pallet.CreatedAt,
      updatedAt: pallet.UpdatedAt
    };
  });

  // Get all parking requests for this customer that are not Completed or Cancelled
  const pendingParkingRequests = await ParkingRequest.findAll({
    where: {
      UserId: userId,
      Status: {
        [Op.notIn]: ['Completed', 'Cancelled']
      }
    },
    include: [
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
        attributes: ['Id', 'CarType', 'CarModel', 'CarCompany', 'CarNumber']
      }
    ],
    order: [['CreatedAt', 'DESC']]
  });

  const parkRequestsData = pendingParkingRequests.map(parkingRequest => ({
    id: parkingRequest.Id,
    userId: parkingRequest.UserId,
    projectId: parkingRequest.ProjectId,
    parkingSystemId: parkingRequest.ParkingSystemId,
    carId: parkingRequest.CarId,
    status: parkingRequest.Status,
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
      carType: parkingRequest.car.CarType,
      carModel: parkingRequest.car.CarModel,
      carCompany: parkingRequest.car.CarCompany,
      carNumber: parkingRequest.car.CarNumber
    } : null,
    createdAt: parkingRequest.CreatedAt,
    updatedAt: parkingRequest.UpdatedAt
  }));

  return {
    pallets: palletsData,
    parkRequests: parkRequestsData
  };
};

// Request Car Release Service
const requestCarRelease = async (userId, palletId) => {
  // Step 1: Find the pallet assigned to the customer
  const pallet = await PalletAllotment.findOne({
    where: {
      Id: palletId,
      UserId: userId,
      Status: 'Assigned'
    },
    include: [
      {
        model: ParkingSystem,
        as: 'parkingSystem',
        attributes: ['Id', 'WingName', 'Type', 'Level', 'Column', 'TimeForEachLevel', 'TimeForHorizontalMove', 'BufferTime', 'ProjectId']
      },
      {
        model: Project,
        as: 'project',
        attributes: ['Id', 'ProjectName', 'SocietyName']
      },
      {
        model: Car,
        as: 'car',
        attributes: ['Id', 'CarType', 'CarModel', 'CarCompany', 'CarNumber']
      }
    ]
  });

  if (!pallet) {
    throw new Error('Pallet not found or not assigned to you');
  }

  // Step 2: Check if there's already a pending request for this pallet
  const existingRequest = await Request.findOne({
    where: {
      PalletAllotmentId: palletId,
      UserId: userId,
      Status: ['Pending', 'Accepted', 'Queued']
    }
  });

  if (existingRequest) {
    throw new Error('A request for this pallet is already pending or in progress');
  }

  // Step 3: Find operator assigned to this parking system
  const operator = await Operator.findOne({
    where: {
      ParkingSystemId: pallet.ParkingSystemId,
      ProjectId: pallet.ProjectId,
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

  if (!operator) {
    throw new Error('No operator assigned to this parking system. Please contact administrator');
  }

  // Step 4: Calculate base estimated time (queue wait applied after create for Tower)
  let estimatedTime = 0;
  let totalEstimatedTime = 0;
  let waitingNumber = 0;

  if (pallet.parkingSystem.Type === 'Tower') {
    // Ground, no pallet on lift → target → ground (queue added in step 5.1)
    estimatedTime = calculateTowerReleaseEstimatedTime({
      targetFloor: pallet.Level,
      currentFloor: 0,
      palletFloor: 0,
      hasPalletOnLift: false,
    });
    totalEstimatedTime = estimatedTime;
  } else if (pallet.parkingSystem.Type === 'Puzzle') {
    // For Puzzle: Calculate based on pallet location
    if (pallet.Level !== null && pallet.Level !== undefined && pallet.LevelBelowGround === null) {
      // Pallet has Level and Column (above ground)
      // Time = (Level * TimePerLevel) + HorizontalMoveTime + BufferTime
      // HorizontalMoveTime is NOT applicable for Level 1
      estimatedTime = (pallet.Level * pallet.parkingSystem.TimeForEachLevel) + 
                     (pallet.Level > 1 ? pallet.parkingSystem.TimeForHorizontalMove : 0) + 
                     (pallet.parkingSystem.BufferTime || 0);
    } else if (pallet.LevelBelowGround !== null && pallet.LevelBelowGround !== undefined) {
      // Pallet has LevelBelowGround and Column (below ground)
      if (pallet.LevelBelowGround === 1) {
        // LevelBelowGround 1: Only (LevelBelowGround * TimePerLevel) + BufferTime
        estimatedTime = (pallet.LevelBelowGround * pallet.parkingSystem.TimeForEachLevel) + (pallet.parkingSystem.BufferTime || 0);
      } else {
        // LevelBelowGround > 1: (LevelBelowGround * TimePerLevel) + ((LevelBelowGround * TimePerLevel) + HorizontalMoveTime + BufferTime)
        estimatedTime = (pallet.LevelBelowGround * pallet.parkingSystem.TimeForEachLevel) + 
                       ((pallet.LevelBelowGround * pallet.parkingSystem.TimeForEachLevel) + 
                        pallet.parkingSystem.TimeForHorizontalMove + 
                        (pallet.parkingSystem.BufferTime || 0));
      }
    } else {
      throw new Error('Pallet location information is invalid');
    }
    totalEstimatedTime = estimatedTime;
  } else {
    throw new Error('Invalid parking system type');
  }

  // Step 5: Create request entry
  const request = await Request.create({
    UserId: userId,
    PalletAllotmentId: palletId,
    ProjectId: pallet.ProjectId,
    ParkingSystemId: pallet.ParkingSystemId,
    CarId: pallet.CarId,
    Status: 'Pending',
    EstimatedTime: estimatedTime
  });

  // Step 5.1: Waiting requests ahead — Tower uses avg target floor × count
  const waitingRequests = await Request.findAll({
    where: {
      ProjectId: pallet.ProjectId,
      ParkingSystemId: pallet.ParkingSystemId,
      Status: { [Op.in]: ['Pending', 'Queued', 'Accepted'] },
      CreatedAt: { [Op.lt]: request.CreatedAt },
      Id: { [Op.ne]: request.Id }
    },
    include: [
      {
        model: PalletAllotment,
        as: 'palletAllotment',
        attributes: ['Id', 'Level']
      }
    ]
  });

  waitingNumber = waitingRequests.length;

  if (pallet.parkingSystem.Type === 'Tower') {
    const floors = waitingRequests
      .map((r) => r.palletAllotment?.Level)
      .filter((level) => level != null && level !== undefined)
      .map((level) => Number(level));
    const towerEstimate = calculateCustomerTowerReleaseQueueEstimate(pallet.Level, floors);
    estimatedTime = towerEstimate.estimatedTime;
    totalEstimatedTime = towerEstimate.totalEstimatedTime;
    waitingNumber = towerEstimate.waitingNumber;
    if (request.EstimatedTime !== estimatedTime) {
      await request.update({ EstimatedTime: estimatedTime });
    }
  }

  // Step 6: Reload request with associations
  await request.reload({
    include: [
      {
        model: Project,
        as: 'project',
        attributes: ['Id', 'ProjectName', 'SocietyName']
      },
      {
        model: User,
        as: 'user',
        attributes: ['Id', 'Username', 'Role']
      },
      {
        model: ParkingSystem,
        as: 'parkingSystem',
        attributes: ['Id', 'WingName', 'Type', 'Level', 'Column']
      },
      {
        model: Car,
        as: 'car',
        attributes: ['Id', 'CarType', 'CarModel', 'CarCompany', 'CarNumber']
      },
      {
        model: PalletAllotment,
        as: 'palletAllotment',
        attributes: ['Id', 'Level', 'Column', 'UserGivenPalletNumber', 'Status'],
        include: [
          {
            model: ParkingSystem,
            as: 'parkingSystem',
            attributes: ['Id', 'WingName', 'Type', 'Level', 'Column']
          },
          {
            model: Project,
            as: 'project',
            attributes: ['Id', 'ProjectName', 'SocietyName']
          }
        ]
      }
    ]
  });

  // Send notification to operator
  const notificationService = require('./notification.service');
  if (operator && operator.user) {
    const customer = await User.findByPk(userId, { attributes: ['Id', 'Username'] });
    const customerName = customer ? customer.Username : 'A customer';
    const carInfo = pallet.car ? `${pallet.car.CarCompany} ${pallet.car.CarModel} (${pallet.car.CarNumber})` : 'their car';
    
    await notificationService.notifyCarReleaseRequest(operator.user.Id, {
      body: `${customerName} has requested to release ${carInfo} from pallet ${pallet.UserGivenPalletNumber || `Level ${pallet.Level}, Column ${pallet.Column}`}`,
      data: {
        requestId: request.Id.toString(),
        userId: userId.toString(),
        palletId: palletId.toString()
      }
    });

    // Emit WebSocket event to operator
    await websocketService.emitToUser(operator.user.Id, 'car_release_request', {
      id: request.Id,
      userId: request.UserId,
      customer: request.user ? {
        id: request.user.Id,
        username: request.user.Username,
        role: request.user.Role
      } : null,
      palletAllotmentId: request.PalletAllotmentId,
      pallet: request.palletAllotment ? {
        id: request.palletAllotment.Id,
        level: request.palletAllotment.Level,
        column: request.palletAllotment.Column,
        userGivenPalletNumber: request.palletAllotment.UserGivenPalletNumber,
        status: request.palletAllotment.Status,
        car: request.car ? {
          id: request.car.Id,
          carType: request.car.CarType,
          carModel: request.car.CarModel,
          carCompany: request.car.CarCompany,
          carNumber: request.car.CarNumber,
          user: request.user ? {
            id: request.user.Id,
            username: request.user.Username
          } : null
        } : null,
        parkingSystem: request.parkingSystem ? {
          id: request.parkingSystem.Id,
          wingName: request.parkingSystem.WingName,
          type: request.parkingSystem.Type,
          level: request.parkingSystem.Level,
          column: request.parkingSystem.Column
        } : null,
        project: request.project ? {
          id: request.project.Id,
          projectName: request.project.ProjectName,
          societyName: request.project.SocietyName
        } : null
      } : null,
      projectId: request.ProjectId,
      parkingSystemId: request.ParkingSystemId,
      carId: request.CarId,
      project: request.project ? {
        id: request.project.Id,
        projectName: request.project.ProjectName,
        societyName: request.project.SocietyName
      } : null,
      parkingSystem: request.parkingSystem ? {
        id: request.parkingSystem.Id,
        wingName: request.parkingSystem.WingName,
        type: request.parkingSystem.Type,
        level: request.parkingSystem.Level,
        column: request.parkingSystem.Column
      } : null,
      car: request.car ? {
        id: request.car.Id,
        carType: request.car.CarType,
        carModel: request.car.CarModel,
        carCompany: request.car.CarCompany,
        carNumber: request.car.CarNumber
      } : null,
      status: request.Status,
      estimatedTime: request.EstimatedTime,
      estimatedTimeFormatted: formatEstimatedTimeInMinutes(request.EstimatedTime),
      createdAt: request.CreatedAt,
      updatedAt: request.UpdatedAt
    });
  }

  return {
    request: {
      id: request.Id,
      userId: request.UserId,
      palletAllotmentId: request.PalletAllotmentId,
      projectId: request.ProjectId,
      parkingSystemId: request.ParkingSystemId,
      carId: request.CarId,
      project: request.project ? {
        id: request.project.Id,
        projectName: request.project.ProjectName,
        societyName: request.project.SocietyName
      } : null,
      parkingSystem: request.parkingSystem ? {
        id: request.parkingSystem.Id,
        wingName: request.parkingSystem.WingName,
        type: request.parkingSystem.Type,
        level: request.parkingSystem.Level,
        column: request.parkingSystem.Column
      } : null,
      car: request.car ? {
        id: request.car.Id,
        carType: request.car.CarType,
        carModel: request.car.CarModel,
        carCompany: request.car.CarCompany,
        carNumber: request.car.CarNumber
      } : null,
      status: request.Status,
      estimatedTime: estimatedTime,
      estimatedTimeFormatted: formatEstimatedTimeInMinutes(estimatedTime),
      totalEstimatedTime: totalEstimatedTime,
      totalEstimatedTimeFormatted: formatEstimatedTimeInMinutes(totalEstimatedTime),
      waitingNumber: waitingNumber,
      createdAt: request.CreatedAt,
      updatedAt: request.UpdatedAt
    },
    pallet: {
      id: pallet.Id,
      level: pallet.Level,
      column: pallet.Column,
      userGivenPalletNumber: pallet.UserGivenPalletNumber,
      parkingSystem: pallet.parkingSystem ? {
        id: pallet.parkingSystem.Id,
        wingName: pallet.parkingSystem.WingName,
        type: pallet.parkingSystem.Type,
        level: pallet.parkingSystem.Level,
        column: pallet.parkingSystem.Column,
        timeForEachLevel: pallet.parkingSystem.TimeForEachLevel,
        timeForHorizontalMove: pallet.parkingSystem.TimeForHorizontalMove,
        bufferTime: pallet.parkingSystem.BufferTime
      } : null,
      project: pallet.project ? {
        id: pallet.project.Id,
        projectName: pallet.project.ProjectName,
        societyName: pallet.project.SocietyName
      } : null,
      car: pallet.car ? {
        id: pallet.car.Id,
        carType: pallet.car.CarType,
        carModel: pallet.car.CarModel,
        carCompany: pallet.car.CarCompany,
        carNumber: pallet.car.CarNumber
      } : null
    },
    message: 'Car release request submitted successfully. Waiting for operator approval.'
  };
};

// Get Customer Requests Service
const getCustomerRequests = async (userId) => {
  // Find all requests created by the customer
  const requests = await Request.findAll({
    where: {
      UserId: userId
    },
    include: [
      {
        model: User,
        as: 'user',
        attributes: ['Id', 'Username', 'Role']
      },
      {
        model: PalletAllotment,
        as: 'palletAllotment',
        attributes: ['Id', 'Level', 'Column', 'UserGivenPalletNumber', 'Status'],
        include: [
          {
            model: Car,
            as: 'car',
            attributes: ['Id', 'CarType', 'CarModel', 'CarCompany', 'CarNumber'],
            required: false
          },
          {
            model: ParkingSystem,
            as: 'parkingSystem',
            attributes: ['Id', 'WingName', 'Type', 'Level', 'Column']
          },
          {
            model: Project,
            as: 'project',
            attributes: ['Id', 'ProjectName', 'SocietyName']
          }
        ]
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
        attributes: ['Id', 'CarType', 'CarModel', 'CarCompany', 'CarNumber']
      }
    ],
    order: [['CreatedAt', 'DESC']] // Order by creation date descending (newest first)
  });

  return requests.map(request => ({
    id: request.Id,
    userId: request.UserId,
    customer: request.user ? {
      id: request.user.Id,
      username: request.user.Username,
      role: request.user.Role
    } : null,
    palletAllotmentId: request.PalletAllotmentId,
    pallet: request.palletAllotment ? {
      id: request.palletAllotment.Id,
      level: request.palletAllotment.Level,
      column: request.palletAllotment.Column,
      userGivenPalletNumber: request.palletAllotment.UserGivenPalletNumber,
      status: request.palletAllotment.Status,
      car: request.palletAllotment.car ? {
        id: request.palletAllotment.car.Id,
        carType: request.palletAllotment.car.CarType,
        carModel: request.palletAllotment.car.CarModel,
        carCompany: request.palletAllotment.car.CarCompany,
        carNumber: request.palletAllotment.car.CarNumber
      } : null,
      parkingSystem: request.palletAllotment.parkingSystem ? {
        id: request.palletAllotment.parkingSystem.Id,
        wingName: request.palletAllotment.parkingSystem.WingName,
        type: request.palletAllotment.parkingSystem.Type,
        level: request.palletAllotment.parkingSystem.Level,
        column: request.palletAllotment.parkingSystem.Column
      } : null,
      project: request.palletAllotment.project ? {
        id: request.palletAllotment.project.Id,
        projectName: request.palletAllotment.project.ProjectName,
        societyName: request.palletAllotment.project.SocietyName
      } : null
    } : null,
    projectId: request.ProjectId,
    parkingSystemId: request.ParkingSystemId,
    carId: request.CarId,
    project: request.project ? {
      id: request.project.Id,
      projectName: request.project.ProjectName,
      societyName: request.project.SocietyName
    } : null,
    parkingSystem: request.parkingSystem ? {
      id: request.parkingSystem.Id,
      wingName: request.parkingSystem.WingName,
      type: request.parkingSystem.Type,
      level: request.parkingSystem.Level,
      column: request.parkingSystem.Column
    } : null,
    car: request.car ? {
      id: request.car.Id,
      carType: request.car.CarType,
      carModel: request.car.CarModel,
      carCompany: request.car.CarCompany,
      carNumber: request.car.CarNumber
    } : null,
    status: request.Status,
    estimatedTime: request.EstimatedTime,
    estimatedTimeFormatted: formatEstimatedTimeInMinutes(request.EstimatedTime),
    createdAt: request.CreatedAt,
    updatedAt: request.UpdatedAt
  }));
};

// Get Customer List Service (Admin and Operator)
const getCustomerList = async (userId, userRole) => {
  let whereClause = {};

  // If operator, filter by their project
  if (userRole === 'operator') {
    // Find operator by userId
    const operator = await Operator.findOne({
      where: { UserId: userId }
    });

    if (!operator) {
      throw new Error('Operator profile not found');
    }

    if (!operator.ProjectId) {
      throw new Error('Operator is not assigned to any project');
    }

    // Filter customers by operator's project
    whereClause.ProjectId = operator.ProjectId;
  }
  // If admin, no filtering needed (get all customers)

  // Find all dummy users to exclude (users with username starting with 'dummynextcraft')
  const dummyUsers = await User.findAll({
    where: { 
      Username: { [Op.like]: 'dummynextcraft%' }
    },
    attributes: ['Id']
  });

  // Exclude all customers associated with dummy users
  if (dummyUsers && dummyUsers.length > 0) {
    const dummyUserIds = dummyUsers.map(user => user.Id);
    whereClause.UserId = {
      [Op.notIn]: dummyUserIds
    };
  }

  // Find customers with associations
  const customers = await Customer.findAll({
    where: whereClause,
    include: [
      {
        model: User,
        as: 'user',
        attributes: ['Id', 'Username', 'Role', 'CreatedAt', 'UpdatedAt']
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
      }
    ],
    order: [['CreatedAt', 'DESC']]
  });

  return customers.map(customer => ({
    id: customer.Id,
    userId: customer.UserId,
    user: {
      id: customer.user.Id,
      username: customer.user.Username,
      role: customer.user.Role,
      createdAt: customer.user.CreatedAt,
      updatedAt: customer.user.UpdatedAt
    },
    firstName: customer.FirstName,
    lastName: customer.LastName,
    email: customer.Email,
    mobileNumber: customer.MobileNumber,
    projectId: customer.ProjectId,
    project: customer.project ? {
      id: customer.project.Id,
      projectName: customer.project.ProjectName,
      societyName: customer.project.SocietyName
    } : null,
    parkingSystemId: customer.ParkingSystemId,
    parkingSystem: customer.parkingSystem ? {
      id: customer.parkingSystem.Id,
      wingName: customer.parkingSystem.WingName,
      type: customer.parkingSystem.Type,
      level: customer.parkingSystem.Level,
      column: customer.parkingSystem.Column
    } : null,
    flatNumber: customer.FlatNumber,
    profession: customer.Profession,
    status: customer.Status,
    approvedBy: customer.ApprovedBy,
    approvedAt: customer.ApprovedAt,
    createdAt: customer.CreatedAt,
    updatedAt: customer.UpdatedAt
  }));
};

// Get Customers with Cars by Project IDs Service (Admin only)
const getCustomersWithCarsByProjectIds = async (projectIds) => {
  // Validate projectIds is an array and not empty
  if (!Array.isArray(projectIds) || projectIds.length === 0) {
    throw new Error('Project IDs array is required and cannot be empty');
  }

  // Convert to integers and filter out invalid values
  const validProjectIds = projectIds
    .map(id => parseInt(id))
    .filter(id => !isNaN(id) && id > 0);

  if (validProjectIds.length === 0) {
    throw new Error('No valid project IDs provided');
  }

  // Find all dummy users to exclude (users with username starting with 'dummynextcraft')
  const dummyUsers = await User.findAll({
    where: { 
      Username: { [Op.like]: 'dummynextcraft%' }
    },
    attributes: ['Id']
  });

  var dummyUserIds = null;
  // Exclude all customers associated with dummy users
  if (dummyUsers && dummyUsers.length > 0) {
    dummyUserIds = dummyUsers.map(user => user.Id);
  }
  // Fetch customers belonging to the specified projects
  const customers = await Customer.findAll({
    where: {
      ProjectId: { [Op.in]: validProjectIds },
      UserId: {
        [Op.notIn]: dummyUserIds
      }
    },
    include: [
      {
        model: User,
        as: 'user',
        attributes: ['Id', 'Username', 'Role', 'CreatedAt', 'UpdatedAt']
      },
      {
        model: Project,
        as: 'project',
        attributes: ['Id', 'ProjectName', 'SocietyName']
      },
      {
        model: ParkingSystem,
        as: 'parkingSystem',
        attributes: ['Id', 'WingName', 'Type', 'Level', 'LevelBelowGround', 'Column']
      }
    ],
    order: [['CreatedAt', 'DESC']]
  });

  // Get all user IDs from customers
  const userIds = customers.map(customer => customer.UserId);
  let carsByUserId = {};

  // Fetch all cars for these customers in one query
  if (userIds.length > 0) {
    const cars = await Car.findAll({
      where: { UserId: { [Op.in]: userIds } },
      attributes: ['Id', 'UserId', 'CarType', 'CarModel', 'CarCompany', 'CarNumber', 'CreatedAt', 'UpdatedAt'],
      order: [['CreatedAt', 'DESC']]
    });

    // Group cars by UserId
    carsByUserId = cars.reduce((acc, car) => {
      if (!acc[car.UserId]) {
        acc[car.UserId] = [];
      }
      acc[car.UserId].push({
        id: car.Id,
        userId: car.UserId,
        carType: car.CarType,
        carModel: car.CarModel,
        carCompany: car.CarCompany,
        carNumber: car.CarNumber,
        createdAt: car.CreatedAt,
        updatedAt: car.UpdatedAt
      });
      return acc;
    }, {});
  }

  return {
    customers: customers.map(customer => ({
      id: customer.Id,
      userId: customer.UserId,
      user: customer.user ? {
        id: customer.user.Id,
        username: customer.user.Username,
        role: customer.user.Role,
        createdAt: customer.user.CreatedAt,
        updatedAt: customer.user.UpdatedAt
      } : null,
      firstName: customer.FirstName,
      lastName: customer.LastName,
      email: customer.Email,
      mobileNumber: customer.MobileNumber,
      projectId: customer.ProjectId,
      project: customer.project ? {
        id: customer.project.Id,
        projectName: customer.project.ProjectName,
        societyName: customer.project.SocietyName
      } : null,
      parkingSystemId: customer.ParkingSystemId,
      parkingSystem: customer.parkingSystem ? {
        id: customer.parkingSystem.Id,
        wingName: customer.parkingSystem.WingName,
        type: customer.parkingSystem.Type,
        level: customer.parkingSystem.Level,
        levelBelowGround: customer.parkingSystem.LevelBelowGround,
        column: customer.parkingSystem.Column
      } : null,
      palletAllotmentId: customer.PalletAllotmentId,
      flatNumber: customer.FlatNumber,
      profession: customer.Profession,
      status: customer.Status,
      approvedBy: customer.ApprovedBy,
      approvedAt: customer.ApprovedAt,
      createdAt: customer.CreatedAt,
      updatedAt: customer.UpdatedAt,
      cars: carsByUserId[customer.UserId] || []
    })),
    count: customers.length
  };
};

module.exports = {
  createCustomer,
  getCustomerProfile,
  createCar,
  getCarList,
  getAvailableCarList,
  getCustomerPalletStatus,
  requestCarRelease,
  getCustomerRequests,
  getCustomerList,
  getCustomersWithCarsByProjectIds
};

