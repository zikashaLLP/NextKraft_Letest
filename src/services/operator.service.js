const { Op } = require('sequelize');
const crypto = require('crypto');
const { sequelize } = require('../config/database');
const { PARKING_SYSTEM_STATUS_VALUES } = require('../constants/parkingSystemStatus');
const notificationService = require('./notification.service');
const parkingSyncService = require('./parkingSync.service');
const { User, Operator, Project, ParkingSystem, PalletAllotment, Customer, Car, Request, RequestQueue, ParkingRequest } = require('../models/associations');
const websocketService = require('./websocket.service');
const { calculateTowerReleaseEstimatedTime } = require('../utils/towerTiming');
const { formatEstimatedTimeInMinutes } = require('../utils/timeFormat');

const normalizeOptionalSyncUuid = (value) => {
  if (value == null) return null;
  const uuid = String(value).trim();
  return uuid.length > 0 ? uuid : null;
};

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

/** Cars whose plate ends with `last4` (RIGHT 4 after stripping spaces), only for customers of this project + parking system. Used by car-in (carNumber path) and call-pallet-by-car-number (retrieve). */
const findCarsMatchingLast4InOperatorScope = async (operator, last4) => {
  const customerRows = await Customer.findAll({
    where: {
      ProjectId: operator.ProjectId,
      ParkingSystemId: operator.ParkingSystemId
    },
    attributes: ['UserId']
  });
  const userIds = [...new Set(customerRows.map((c) => c.UserId))];
  if (userIds.length === 0) {
    return [];
  }

  return Car.findAll({
    where: {
      UserId: { [Op.in]: userIds },
      [Op.and]: sequelize.where(
        sequelize.fn(
          'RIGHT',
          sequelize.fn('REPLACE', sequelize.col('CarNumber'), ' ', ''),
          4
        ),
        last4
      )
    },
    attributes: ['Id', 'UserId', 'CarType', 'CarModel', 'CarCompany', 'CarNumber']
  });
};

// Helper function to emit WebSocket event to all customers in a project when parking system status changes
const emitParkingSystemStatusToProjectCustomers = async (projectId, parkingSystemId, status, updatedAt) => {
  if (!projectId) {
    return;
  }

  try {
    
    // Get all customers for this project
    const projectCustomers = await Customer.findAll({
      where: {
        ProjectId: projectId,
        ParkingSystemId: parkingSystemId,
        Status: 'Approved'
      },
      attributes: ['UserId'],
      include: [
        {
          model: User,
          as: 'user',
          attributes: ['Id', 'Role'],
          where: { Role: 'customer' },
          required: true
        }
      ]
    });

    // Extract user IDs
    const customerUserIds = projectCustomers
      .map(customer => customer.UserId)
      .filter(userId => userId !== null && userId !== undefined);

    // Emit to all customers in the project
    if (customerUserIds.length > 0) {
      websocketService.emitToUsers(customerUserIds, 'parking_system_status_changed', {
        parkingSystemId: parkingSystemId,
        status: status,
        projectId: projectId,
        updatedAt: updatedAt
      });
      console.log(`📤 WebSocket: Emitted parking system status (${status}) to ${customerUserIds.length} customers in project ${projectId}`);
    }
  } catch (error) {
    console.error('Error emitting WebSocket event to customers:', error);
    // Don't throw error, just log it
  }
};

// Create Operator Service
const createOperator = async (operatorData) => {
  // Step 1: Create user first
  // Check if user already exists
  const existingUser = await User.findOne({ where: { Username: operatorData.Username } });
  
  if (existingUser) {
    throw new Error('Username already exists');
  }

  // Create new user with operator role
  const user = await User.create({
    Username: operatorData.Username,
    Password: operatorData.Password,
    Role: 'operator'
  });

  const userId = user.Id;

  // Step 2: Validate project exists
  if (operatorData.ProjectId) {
    const project = await Project.findByPk(operatorData.ProjectId);
    if (!project) {
      // Rollback: delete the created user
      await user.destroy();
      throw new Error('Project not found');
    }
  }

  // Step 3: Validate parking system exists (if provided)
  if (operatorData.ParkingSystemId) {
    const parkingSystem = await ParkingSystem.findByPk(operatorData.ParkingSystemId);
    if (!parkingSystem) {
      // Rollback: delete the created user
      await user.destroy();
      throw new Error('Parking system not found');
    }
  }

  // Step 4: Determine status and approval details based on admin role
  let status = 'Pending';
  let approvedBy = null;
  let approvedAt = null;

  if (operatorData.AdminRole === 'admin') {
    status = 'Approved';
    approvedBy = operatorData.AdminUserId;
    approvedAt = getISTTime();
  }

  // Step 5: Get IST time for CreatedAt and UpdatedAt
  const istTime = getISTTime();

  // Step 6: Create operator record
  const operatorEmail = operatorData.Email
    ? String(operatorData.Email).trim().toLowerCase()
    : null;
  const operator = await Operator.create({
    UserId: userId,
    FirstName: operatorData.FirstName,
    LastName: operatorData.LastName,
    Email: operatorEmail,
    MobileNumber: operatorData.MobileNumber,
    ProjectId: operatorData.ProjectId,
    ParkingSystemId: operatorData.ParkingSystemId,
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
    operator: {
      id: operator.Id,
      userId: operator.UserId,
      firstName: operator.FirstName,
      lastName: operator.LastName,
      email: operator.Email,
      mobileNumber: operator.MobileNumber,
      projectId: operator.ProjectId,
      parkingSystemId: operator.ParkingSystemId,
      status: operator.Status,
      approvedBy: operator.ApprovedBy,
      approvedAt: operator.ApprovedAt,
      createdAt: operator.CreatedAt,
      updatedAt: operator.UpdatedAt
    }
  };
};

// Get Operator Profile Service
const getOperatorProfile = async (userId) => {
  // Find operator by userId
  const operator = await Operator.findOne({
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

  if (!operator) {
    throw new Error('Operator profile not found');
  }

  return {
    user: {
      id: operator.user.Id,
      username: operator.user.Username,
      role: operator.user.Role,
      createdAt: operator.user.CreatedAt,
      updatedAt: operator.user.UpdatedAt
    },
    operator: {
      id: operator.Id,
      userId: operator.UserId,
      firstName: operator.FirstName,
      lastName: operator.LastName,
      email: operator.Email,
      mobileNumber: operator.MobileNumber,
      projectId: operator.ProjectId,
      project: operator.project ? {
        id: operator.project.Id,
        projectName: operator.project.ProjectName,
        societyName: operator.project.SocietyName
      } : null,
      parkingSystemId: operator.ParkingSystemId,
      parkingSystem: operator.parkingSystem ? {
        id: operator.parkingSystem.Id,
        wingName: operator.parkingSystem.WingName,
        type: operator.parkingSystem.Type,
        level: operator.parkingSystem.Level,
        column: operator.parkingSystem.Column
      } : null,
      status: operator.Status,
      hasPalletPower: operator.HasPalletPower,
      approvedBy: operator.ApprovedBy,
      approvedAt: operator.ApprovedAt,
      createdAt: operator.CreatedAt,
      updatedAt: operator.UpdatedAt
    }
  };
};

// Get Operator List Service (Admin only)
const getOperatorList = async () => {
  // Find all operators with related data
  const operators = await Operator.findAll({
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

  return operators.map(operator => ({
    id: operator.Id,
    userId: operator.UserId,
    user: {
      id: operator.user.Id,
      username: operator.user.Username,
      role: operator.user.Role,
      createdAt: operator.user.CreatedAt,
      updatedAt: operator.user.UpdatedAt
    },
    firstName: operator.FirstName,
    lastName: operator.LastName,
    email: operator.Email,
    mobileNumber: operator.MobileNumber,
    projectId: operator.ProjectId,
    project: operator.project ? {
      id: operator.project.Id,
      projectName: operator.project.ProjectName,
      societyName: operator.project.SocietyName
    } : null,
    parkingSystemId: operator.ParkingSystemId,
    parkingSystem: operator.parkingSystem ? {
      id: operator.parkingSystem.Id,
      wingName: operator.parkingSystem.WingName,
      type: operator.parkingSystem.Type,
      level: operator.parkingSystem.Level,
      column: operator.parkingSystem.Column
    } : null,
    status: operator.Status,
    hasPalletPower: operator.HasPalletPower,
    approvedBy: operator.ApprovedBy,
    approvedAt: operator.ApprovedAt,
    createdAt: operator.CreatedAt,
    updatedAt: operator.UpdatedAt
  }));
};

// Get Operator Project with Parking Systems Service
const getOperatorProjectWithParkingSystems = async (userId) => {
  // Find operator by userId
  const operator = await Operator.findOne({
    where: { UserId: userId },
    include: [
      {
        model: Project,
        as: 'project',
        attributes: ['Id', 'ProjectName', 'SocietyName', 'CreatedAt', 'UpdatedAt']
      }
    ]
  });

  if (!operator) {
    throw new Error('Operator profile not found');
  }

  if (!operator.ProjectId) {
    throw new Error('Operator is not assigned to any project');
  }

  const projectId = operator.ProjectId;

  // Get all parking systems for this project (basic details only, no pallet details)
  const parkingSystems = await ParkingSystem.findAll({
    where: { ProjectId: projectId },
    attributes: [
      'Id',
      'WingName',
      'ProjectId',
      'Type',
      'Level',
      'Column',
      'TotalNumberOfPallet',
      'TimeForEachLevel',
      'TimeForHorizontalMove',
      'BufferTime',
      'CreatedAt',
      'UpdatedAt'
    ],
    order: [['CreatedAt', 'ASC']]
  });

  return {
    project: {
      id: operator.project.Id,
      projectName: operator.project.ProjectName,
      societyName: operator.project.SocietyName,
      createdAt: operator.project.CreatedAt,
      updatedAt: operator.project.UpdatedAt
    },
    parkingSystems: parkingSystems.map(parkingSystem => ({
      id: parkingSystem.Id,
      wingName: parkingSystem.WingName,
      projectId: parkingSystem.ProjectId,
      type: parkingSystem.Type,
      level: parkingSystem.Level,
      column: parkingSystem.Column,
      totalNumberOfPallet: parkingSystem.TotalNumberOfPallet,
      timeForEachLevel: parkingSystem.TimeForEachLevel,
      timeForHorizontalMove: parkingSystem.TimeForHorizontalMove,
      bufferTime: parkingSystem.BufferTime,
      createdAt: parkingSystem.CreatedAt,
      updatedAt: parkingSystem.UpdatedAt
    })),
    count: parkingSystems.length
  };
};

// Car in — parking request → Accepted; resolve pallet by floor + column; ETA from that pallet. Assignment in parkCar only.
const carIn = async (operatorUserId, floor, floorColumn, parkingRequestId = null, carNumber = null) => {
  // Step 1: Validate operator exists and get operator details
  const operator = await Operator.findOne({
    where: { UserId: operatorUserId }
  });

  if (!operator) {
    throw new Error('Operator profile not found');
  }

  // Step 2: Validate operator has parking system assigned
  if (!operator.ParkingSystemId || !operator.ProjectId) {
    throw new Error('Operator is not assigned to a project and parking system');
  }

  let parkingRequest = null;
  let customer = null;
  let car = null;

  // Step 3: Handle two scenarios: parkingRequestId OR carNumber
  if (parkingRequestId) {
    // Scenario 1: parkingRequestId provided - follow current flow
    parkingRequest = await ParkingRequest.findOne({
      where: {
        Id: parkingRequestId,
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
          attributes: ['Id', 'CarType', 'CarModel', 'CarCompany', 'CarNumber']
        }
      ]
    });

    if (!parkingRequest) {
      throw new Error('Parking request not found or does not belong to your parking system');
    }

    // Validate parking request status (should be Pending or Accepted)
    if (!['Pending', 'Accepted', 'Queued'].includes(parkingRequest.Status)) {
      throw new Error(`Cannot assign pallet to a parking request with status: ${parkingRequest.Status}`);
    }

    // Find customer from parking request
    customer = await Customer.findOne({
      where: {
        UserId: parkingRequest.UserId,
        ProjectId: operator.ProjectId,
        ParkingSystemId: operator.ParkingSystemId
      },
      include: [
        {
          model: User,
          as: 'user',
          attributes: ['Id', 'Username', 'Role']
        }
      ]
    });

    if (!customer) {
      throw new Error('Customer not found for this parking request');
    }

    // Validate customer is approved
    if (customer.Status !== 'Approved') {
      throw new Error('Customer is not approved. Only approved customers can be assigned to pallets');
    }

    // Get car from parking request
    car = parkingRequest.car;
    if (!car) {
      throw new Error('Car not found in parking request');
    }

  } else if (carNumber) {
    // Scenario 2: carNumber = last 4 digits — same scope/match rule as retrieve (project + parking system)
    const matches = await findCarsMatchingLast4InOperatorScope(operator, carNumber);

    if (matches.length > 1) {
      throw new Error('Multiple cars match last 4 digits in this parking system');
    }

    let userId = null;

    if (matches.length === 0) {
      // Car doesn't exist - need to create user, customer, and car
      // Step: Find or create dummy user for this parking system
      // Each parking system should have only one dummy user
      
      // First, check if there's already a dummy customer for this parking system
      // (which means there's already a dummy user for this parking system)
      let existingDummyCustomer = await Customer.findOne({
        where: {
          ParkingSystemId: operator.ParkingSystemId,
          ProjectId: operator.ProjectId
        },
        include: [
          {
            model: User,
            as: 'user',
            where: {
              Username: { [Op.like]: 'dummynextcraft%' }
            },
            attributes: ['Id', 'Username', 'Role']
          }
        ]
      });

      let user = null;

      if (existingDummyCustomer && existingDummyCustomer.user) {
        // Dummy user already exists for this parking system, use it
        user = existingDummyCustomer.user;
        customer = existingDummyCustomer;
      } else {
        // No dummy user exists for this parking system, create a new one
        // Generate UUID for username
        const uuid = crypto.randomUUID();
        const dummyUsername = `dummynextcraft${uuid}`;
        
        // Create user with dummy password
        const bcrypt = require('bcryptjs');
        const hashedPassword = await bcrypt.hash('dummy123', 10);
        
        user = await User.create({
          Username: dummyUsername,
          Password: hashedPassword,
          Role: 'customer'
        });

        // Create dummy customer for this parking system
        const istTime = getISTTime();
        customer = await Customer.create({
          UserId: user.Id,
          FirstName: 'Dummy',
          LastName: 'Customer',
          Email: null,
          MobileNumber: null,
          ProjectId: operator.ProjectId,
          ParkingSystemId: operator.ParkingSystemId,
          FlatNumber: null,
          Status: 'Approved', // Auto-approve dummy customer
          ApprovedBy: operatorUserId,
          ApprovedAt: istTime,
          CreatedAt: istTime,
          UpdatedAt: istTime
        });
        
        // Reload with user association
        await customer.reload({
          include: [
            {
              model: User,
              as: 'user',
              attributes: ['Id', 'Username', 'Role']
            }
          ]
        });
      }

      userId = user.Id;

      // Create car for the user
      const istTime = getISTTime();
      car = await Car.create({
        UserId: userId,
        CarType: null,
        CarModel: null,
        CarCompany: null,
        CarNumber: carNumber,
        CreatedAt: istTime,
        UpdatedAt: istTime
      });
    } else {
      // Exactly one car matched last 4 in scope — get user and customer
      car = matches[0];
      userId = car.UserId;
      
      customer = await Customer.findOne({
        where: {
          UserId: userId,
          ProjectId: operator.ProjectId,
          ParkingSystemId: operator.ParkingSystemId
        },
        include: [
          {
            model: User,
            as: 'user',
            attributes: ['Id', 'Username', 'Role']
          }
        ]
      });

      if (!customer) {
        throw new Error('Customer not found for this car');
      }

      // Validate customer is approved
      if (customer.Status !== 'Approved') {
        throw new Error('Customer is not approved. Only approved customers can be assigned to pallets');
      }
    }

    // Step 3.2: Check if parking request exists (not completed or cancelled)
    const existingParkingRequest = await ParkingRequest.findOne({
      where: {
        CarId: car.Id,
        UserId: car.UserId,
        ProjectId: operator.ProjectId,
        ParkingSystemId: operator.ParkingSystemId,
        Status: { [Op.notIn]: ['Completed', 'Cancelled'] }
      }
    });

    if (!existingParkingRequest) {
      // Create new parking request
      const istTime = getISTTime();
      parkingRequest = await ParkingRequest.create({
        UserId: car.UserId,
        ProjectId: operator.ProjectId,
        ParkingSystemId: operator.ParkingSystemId,
        CarId: car.Id,
        Status: 'Pending',
        CreatedAt: istTime,
        UpdatedAt: istTime
      });
    } else {
      parkingRequest = existingParkingRequest;
      
      // Validate parking request status (should be Pending or Accepted)
      if (!['Pending', 'Accepted', 'Queued'].includes(parkingRequest.Status)) {
        throw new Error(`Cannot assign pallet to a parking request with status: ${parkingRequest.Status}`);
      }
    }

  } else {
    throw new Error('Either parkingRequestId or carNumber must be provided');
  }

  // Step 8: Get parking system with time information
  const parkingSystem = await ParkingSystem.findByPk(operator.ParkingSystemId, {
    attributes: ['Id', 'WingName', 'Type', 'Level', 'LevelBelowGround', 'Column', 'TimeForEachLevel', 'TimeForHorizontalMove', 'BufferTime']
  });

  if (!parkingSystem) {
    throw new Error('Parking system not found');
  }

  // Step 9: Find pallet by floor + column (operator's parking system). Above ground: Level + Column. Below ground (Puzzle): LevelBelowGround + Column (Level IS NULL).
  const pallet = await PalletAllotment.findOne({
    where: {
      ParkingSystemId: operator.ParkingSystemId,
      ProjectId: operator.ProjectId,
      Column: floorColumn,
      [Op.or]: [
        { Level: floor, LevelBelowGround: { [Op.is]: null } },
        { LevelBelowGround: floor, Level: { [Op.is]: null } }
      ]
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
      }
    ]
  });

  if (!pallet) {
    throw new Error('No pallet found for this floor and column');
  }

  const palletId = pallet.Id;

  // Step 10: Validate pallet belongs to operator's parking system
  if (pallet.ParkingSystemId !== operator.ParkingSystemId) {
    throw new Error('Pallet does not belong to your parking system');
  }

  // Step 12: Validate pallet belongs to the same project
  if (operator.ProjectId !== pallet.ProjectId) {
    throw new Error('Operator does not have access to this project');
  }

  // Idempotent car-in: already Accepted → same 200 response (no re-notify, no duplicate update)
  if (parkingRequest.Status === 'Accepted') {
    return {
      parkingRequestId: parkingRequest.Id,
      palletId
    };
  }

  // Step 11: Validate pallet is released (not already assigned)
  if (pallet.Status === 'Assigned' && pallet.UserId !== 0) {
    throw new Error('Pallet is already assigned to another customer');
  }

  // Step 13: Calculate time to move pallet to parking (same logic as callEmptyPallet)
  let timeToParking = 0;
  
  if (parkingSystem.Type === 'Tower') {
    // For Tower: (Level * TimePerLevel) + BufferTime
    timeToParking = (pallet.Level * parkingSystem.TimeForEachLevel) + parkingSystem.BufferTime;
  } else if (parkingSystem.Type === 'Puzzle') {
    // For Puzzle: Calculate based on pallet location
    if (pallet.Level !== null && pallet.Level !== undefined && pallet.LevelBelowGround === null) {
      // Pallet has Level and Column (above ground)
      // Time = (Level * TimePerLevel) + HorizontalMoveTime + BufferTime
      // HorizontalMoveTime is NOT applicable for Level 1
      timeToParking = (pallet.Level * parkingSystem.TimeForEachLevel) + 
                     (pallet.Level > 1 ? parkingSystem.TimeForHorizontalMove : 0) + 
                     parkingSystem.BufferTime;
    } else if (pallet.LevelBelowGround !== null && pallet.LevelBelowGround !== undefined) {
      // Pallet has LevelBelowGround and Column (below ground)
      if (pallet.LevelBelowGround === 1) {
        // LevelBelowGround 1: Only (LevelBelowGround * TimePerLevel) + BufferTime
        timeToParking = (pallet.LevelBelowGround * parkingSystem.TimeForEachLevel) + parkingSystem.BufferTime;
      } else {
        // LevelBelowGround > 1: (LevelBelowGround * TimePerLevel) + ((LevelBelowGround * TimePerLevel) + HorizontalMoveTime + BufferTime)
        timeToParking = (pallet.LevelBelowGround * parkingSystem.TimeForEachLevel) + 
                       ((pallet.LevelBelowGround * parkingSystem.TimeForEachLevel) + 
                        parkingSystem.TimeForHorizontalMove + 
                        parkingSystem.BufferTime);
      }
    } else {
      throw new Error('Pallet location information is invalid');
    }
  }

  // Format time in human-readable format
  const formatTime = (seconds) => {
    const minutes = Math.floor(seconds / 60);
    const remainingSeconds = seconds % 60;
    if (minutes > 0 && remainingSeconds > 0) {
      return `${minutes} minute${minutes > 1 ? 's' : ''} ${remainingSeconds} second${remainingSeconds > 1 ? 's' : ''}`;
    } else if (minutes > 0) {
      return `${minutes} minute${minutes > 1 ? 's' : ''}`;
    } else {
      return `${remainingSeconds} second${remainingSeconds > 1 ? 's' : ''}`;
    }
  };

  // Format the time to parking
  const timeToParkingFormatted = formatTime(timeToParking);

  // Step 14: Check if car is already assigned to another pallet
  const existingPalletAssignment = await PalletAllotment.findOne({
    where: {
      CarId: car.Id,
      Status: 'Assigned',
      Id: { [Op.ne]: palletId } // Exclude current pallet
    }
  });

  if (existingPalletAssignment) {
    throw new Error('Car is already assigned to another pallet');
  }

  const istTime = getISTTime();

  await parkingRequest.update({
    Status: 'Accepted',
    UpdatedAt: istTime
  });

  const carInfo = car
    ? [car.CarCompany, car.CarModel, car.CarNumber].filter(Boolean).join(' ') || 'your car'
    : 'your car';
  const palletInfo = pallet.UserGivenPalletNumber || `Level ${pallet.Level}, Column ${pallet.Column}`;

  if (customer && customer.user) {
    await notificationService.notifyParkingRequestAccepted(customer.UserId, {
      body: `Your parking request has been accepted. Pallet ${palletInfo} is being moved to parking level with car ${carInfo}.`,
      data: {
        requestId: parkingRequest.Id,
        palletId: palletId,
        carId: car.Id,
        status: 'Accepted',
        estimatedTime: timeToParking,
        estimatedTimeFormatted: timeToParkingFormatted
      }
    });

    await websocketService.emitToUser(customer.UserId, 'parking_request_accepted', {
      palletId: palletId.toString(),
      customerId: customer.Id.toString(),
      carId: car.Id.toString(),
      status: 'Accepted',
      parkingRequestId: parkingRequest.Id.toString(),
      estimatedTime: timeToParking,
      estimatedTimeFormatted: timeToParkingFormatted
    });
  }

  return {
    parkingRequestId: parkingRequest.Id,
    palletId
  };
};

// Assign pallet (UserId, CarId, Assigned; CarType not set on pallet), complete parking request, notify pallet_assigned.
const parkCar = async (operatorUserId, parkingRequestId, palletId, syncUuid = null) => {
  const operator = await Operator.findOne({
    where: { UserId: operatorUserId }
  });
  const liveSyncUuid = normalizeOptionalSyncUuid(syncUuid);

  if (!operator) {
    throw new Error('Operator profile not found');
  }

  if (!operator.ParkingSystemId || !operator.ProjectId) {
    throw new Error('Operator is not assigned to a project and parking system');
  }

  const parkingRequest = await ParkingRequest.findOne({
    where: {
      Id: parkingRequestId,
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
        attributes: ['Id', 'CarType', 'CarModel', 'CarCompany', 'CarNumber']
      }
    ]
  });

  if (!parkingRequest) {
    throw new Error('Parking request not found or does not belong to your parking system');
  }

  if (parkingRequest.Status !== 'Accepted') {
    throw new Error(`Cannot park car for parking request with status: ${parkingRequest.Status}. Expected Accepted.`);
  }

  const car = parkingRequest.car;
  if (!car) {
    throw new Error('Car not found in parking request');
  }

  const pallet = await PalletAllotment.findByPk(palletId, {
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
      }
    ]
  });

  if (!pallet) {
    throw new Error('Pallet not found');
  }

  if (pallet.ParkingSystemId !== operator.ParkingSystemId) {
    throw new Error('Pallet does not belong to your parking system');
  }

  if (pallet.Status === 'Assigned' && pallet.UserId !== 0) {
    throw new Error('Pallet is already assigned to another customer');
  }

  if (operator.ProjectId !== pallet.ProjectId) {
    throw new Error('Operator does not have access to this project');
  }

  const existingPalletAssignment = await PalletAllotment.findOne({
    where: {
      CarId: car.Id,
      Status: 'Assigned',
      Id: { [Op.ne]: palletId }
    }
  });

  if (existingPalletAssignment) {
    throw new Error('Car is already assigned to another pallet');
  }

  const customer = await Customer.findOne({
    where: {
      UserId: parkingRequest.UserId,
      ProjectId: operator.ProjectId,
      ParkingSystemId: operator.ParkingSystemId
    },
    include: [
      {
        model: User,
        as: 'user',
        attributes: ['Id', 'Username', 'Role']
      }
    ]
  });

  const istTime = getISTTime();

  await pallet.update({
    UserId: parkingRequest.UserId,
    CarId: car.Id,
    Status: 'Assigned',
    UpdatedAt: istTime
  });

  await parkingRequest.update({
    Status: 'Completed',
    UpdatedAt: istTime
  });

  const updatedPallet = await PalletAllotment.findByPk(pallet.Id, {
    include: [
      {
        model: Car,
        as: 'car',
        attributes: ['Id', 'CarType', 'CarModel', 'CarCompany', 'CarNumber']
      }
    ]
  });

  if (customer && customer.user) {
    const palletInfo = updatedPallet.UserGivenPalletNumber || `Level ${updatedPallet.Level}, Column ${updatedPallet.Column}`;
    const carForMsg = parkingRequest.car;
    const carInfo = carForMsg
      ? [carForMsg.CarCompany, carForMsg.CarModel, carForMsg.CarNumber].filter(Boolean).join(' ') || 'your car'
      : 'your car';

    await notificationService.notifyCarParked(customer.UserId, {
      body: `Your car ${carInfo} has been parked on pallet ${palletInfo}.`,
      data: {
        palletId: pallet.Id.toString(),
        customerId: customer.Id.toString(),
        carId: car.Id.toString(),
        parkingRequestId: parkingRequest.Id.toString()
      }
    });

    await websocketService.emitToUser(customer.UserId, 'pallet_assigned', {
      palletId: pallet.Id.toString(),
      customerId: customer.Id.toString(),
      carId: car.Id.toString(),
      status: updatedPallet.Status,
      parkingRequestId: parkingRequest.Id.toString()
    });
  }

  // Durable ledger so parking-sync can no-op / re-ACK this Omron row after live park.
  if (liveSyncUuid) {
    try {
      await parkingSyncService.recordLiveSyncPhase({
        syncUuid: liveSyncUuid,
        phase: parkingSyncService.PHASE_PARKING,
        operator,
        palletId: pallet.Id,
        carId: car.Id,
        userId: parkingRequest.UserId,
        parkingRequestId: parkingRequest.Id
      });
    } catch (ledgerError) {
      console.error('[PARK_CAR] Failed to record live sync ledger:', ledgerError.message || ledgerError);
    }
  }

  return {
    parkingRequestId: parkingRequest.Id,
    palletId: pallet.Id,
    status: 'Completed',
    syncUuid: liveSyncUuid
  };
};

// Get Operator Requests Service
const getOperatorRequests = async (operatorUserId) => {
  // Step 1: Find operator by userId
  const operator = await Operator.findOne({
    where: { UserId: operatorUserId }
  });

  if (!operator) {
    throw new Error('Operator profile not found');
  }

  // Step 2: Validate operator has project and parking system assigned
  if (!operator.ProjectId || !operator.ParkingSystemId) {
    throw new Error('Operator is not assigned to a project and parking system');
  }

  // Step 3: Find all requests for this operator's project and parking system
  const requests = await Request.findAll({
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
        model: PalletAllotment,
        as: 'palletAllotment',
        attributes: ['Id', 'Level', 'Column', 'UserGivenPalletNumber', 'Status'],
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
    order: [
      ['Status', 'ASC'], // Order by status: Pending first, then Accepted, Queued, Completed, Cancelled
      ['CreatedAt', 'DESC'] // Then by creation date (newest first)
    ]
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
        carNumber: request.palletAllotment.car.CarNumber,
        user: request.palletAllotment.car.user ? {
          id: request.palletAllotment.car.user.Id,
          username: request.palletAllotment.car.user.Username
        } : null
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

/**
 * Update release request status.
 * - operator: existing transitions within their project + parking system
 * - customer: only Cancelled, and only while status is Pending, on own request
 */
const updateRequestStatus = async (actorUserId, requestId, newStatus, actorRole = 'operator') => {
  let request;
  let cancelledByCustomer = false;

  if (actorRole === 'customer') {
    if (newStatus !== 'Cancelled') {
      throw new Error('Customers can only cancel a pending release request');
    }

    request = await Request.findOne({
      where: {
        Id: requestId,
        UserId: actorUserId
      },
      include: [
        {
          model: PalletAllotment,
          as: 'palletAllotment',
          attributes: ['Id', 'UserId', 'CarId', 'Status', 'Level', 'Column', 'UserGivenPalletNumber']
        },
        {
          model: User,
          as: 'user',
          attributes: ['Id', 'Username', 'Role']
        }
      ]
    });

    if (!request) {
      throw new Error('Request not found or not assigned to you');
    }

    if (request.Status !== 'Pending') {
      throw new Error('Customers can only cancel a release request while it is Pending');
    }

    cancelledByCustomer = true;
  } else {
    // Step 1: Find operator by userId
    const operator = await Operator.findOne({
      where: { UserId: actorUserId }
    });

    if (!operator) {
      throw new Error('Operator profile not found');
    }

    // Step 2: Validate operator has project and parking system assigned
    if (!operator.ProjectId || !operator.ParkingSystemId) {
      throw new Error('Operator is not assigned to a project and parking system');
    }

    // Step 3: Find the request and validate it belongs to operator's project and parking system
    request = await Request.findOne({
      where: {
        Id: requestId,
        ProjectId: operator.ProjectId,
        ParkingSystemId: operator.ParkingSystemId
      },
      include: [
        {
          model: PalletAllotment,
          as: 'palletAllotment',
          attributes: ['Id', 'UserId', 'CarId', 'Status', 'Level', 'Column', 'UserGivenPalletNumber']
        },
        {
          model: User,
          as: 'user',
          attributes: ['Id', 'Username', 'Role']
        }
      ]
    });

    if (!request) {
      throw new Error('Request not found or not assigned to you');
    }

    // Step 3: Validate status transition
    const validTransitions = {
      'Pending': ['Accepted', 'Queued', 'Cancelled'],
      'Accepted': ['Queued', 'Completed', 'Cancelled'],
      'Queued': ['Completed', 'Cancelled'],
      'Completed': [], // Cannot change from Completed
      'Cancelled': [] // Cannot change from Cancelled
    };

    if (!validTransitions[request.Status] || !validTransitions[request.Status].includes(newStatus)) {
      throw new Error(`Invalid status transition from ${request.Status} to ${newStatus}`);
    }
  }

  // Step 4: Update request status
  const istTime = getISTTime();

  await request.update({
    Status: newStatus,
    UpdatedAt: istTime
  });

  // Step 5: If status is "Completed", release pallet, move to RequestQueue, then remove request
  if (newStatus === 'Completed') {
    if (request.palletAllotment) {
      const pallet = request.palletAllotment;

      // Release the pallet: set UserId to 0, CarId to null, Status to 'Released'
      await pallet.update({
        UserId: 0,
        CarId: null,
        CarType: null,
        Status: 'Released',
        UpdatedAt: istTime
      });
    }

    // Insert into RequestQueue as history
    await RequestQueue.create({
      UserId: request.UserId,
      PalletAllotmentId: request.PalletAllotmentId,
      ProjectId: request.ProjectId,
      ParkingSystemId: request.ParkingSystemId,
      CarId: request.CarId,
      Status: request.Status,
      EstimatedTime: request.EstimatedTime,
      CreatedAt: request.CreatedAt,
      UpdatedAt: istTime
    });

    // Delete original request
    await request.destroy();

    return {
      request: null,
      message: 'Request completed, logged to history, and removed from active requests. Pallet has been released.'
    };
  }

  // Step 6: Reload request with all associations for non-completed statuses
  await request.reload({
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
        attributes: ['Id', 'CarType', 'CarModel', 'CarCompany', 'CarNumber']
      },
      {
        model: PalletAllotment,
        as: 'palletAllotment',
        attributes: ['Id', 'UserId', 'CarId', 'Status', 'Level', 'Column', 'UserGivenPalletNumber'],
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
      }
    ]
  });

  const statusData = {
    requestId: requestId.toString(),
    status: newStatus
  };

  if (cancelledByCustomer) {
    // Customer cancelled Pending release — notify operator for live refresh
    const operator = await Operator.findOne({
      where: {
        ProjectId: request.ProjectId,
        ParkingSystemId: request.ParkingSystemId
      },
      include: [{ model: User, as: 'user', attributes: ['Id', 'Username', 'Role'] }]
    });

    if (operator?.user) {
      await notificationService.sendToUser({
        userId: operator.user.Id,
        title: 'Release Request Cancelled',
        body: 'A customer cancelled their pending release request.',
        type: notificationService.NOTIFICATION_TYPES.REQUEST_STATUS_UPDATE,
        data: statusData
      });

      websocketService.emitToUser(operator.user.Id, 'request_status_changed', {
        requestId: request.Id,
        carId: request.CarId,
        status: newStatus,
        estimatedTime: request.EstimatedTime,
        updatedAt: istTime,
        cancelledBy: 'customer'
      });
    }

    if (request.user) {
      websocketService.emitToUser(request.user.Id, 'request_status_changed', {
        requestId: request.Id,
        carId: request.CarId,
        status: newStatus,
        estimatedTime: request.EstimatedTime,
        updatedAt: istTime,
        cancelledBy: 'customer'
      });
    }
  } else if (request.user) {
    // Send notification to customer when operator changes request status
    if (newStatus === 'Accepted') {
      await notificationService.notifyReleaseRequestAccepted(request.user.Id, {
        body: 'Your car release request has been accepted by the operator.',
        data: {
          ...statusData,
          estimatedTime: request.EstimatedTime,
          updatedAt: request.UpdatedAt
        }
      });
    } else if (newStatus === 'Cancelled') {
      await notificationService.notifyReleaseRequestRejected(request.user.Id, {
        body: 'Your car release request has been rejected.',
        data: statusData
      });
    } else if (newStatus === 'Completed') {
      await notificationService.notifyCarReleased(request.user.Id, {
        body: 'Your car has been released successfully.',
        data: statusData
      });
    } else {
      await notificationService.sendToUser({
        userId: request.user.Id,
        title: 'Request Status Updated',
        body:
          newStatus === 'Queued'
            ? 'Your car release request has been queued for processing.'
            : `Your car release request status has been updated to ${newStatus}`,
        type: notificationService.NOTIFICATION_TYPES.REQUEST_STATUS_UPDATE,
        data: statusData
      });
    }

    // Emit WebSocket event for real-time update
    websocketService.emitToUser(request.user.Id, 'request_status_changed', {
      requestId: request.Id,
      carId: request.CarId,
      status: newStatus,
      estimatedTime: request.EstimatedTime,
      updatedAt: istTime
    });
  }

  return {
    request: {
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
        userId: request.palletAllotment.UserId,
        carId: request.palletAllotment.CarId,
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
    },
    message: `Request status updated to ${newStatus} successfully.`
  };
};

// Update Operator Pallet Power Service (Admin only)
const updateOperatorPalletPower = async (operatorId, hasPalletPower) => {
  // Step 1: Find the operator by ID
  const operator = await Operator.findByPk(operatorId);

  if (!operator) {
    throw new Error('Operator not found');
  }

  // Step 2: Get IST time for UpdatedAt
  const istTime = getISTTime();

  // Step 3: Update the HasPalletPower field
  await operator.update({
    HasPalletPower: hasPalletPower,
    UpdatedAt: istTime
  });

  // Step 4: Reload operator with associations
  await operator.reload({
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
      }
    ]
  });

  return {
    operator: {
      id: operator.Id,
      userId: operator.UserId,
      user: {
        id: operator.user.Id,
        username: operator.user.Username,
        role: operator.user.Role
      },
      firstName: operator.FirstName,
      lastName: operator.LastName,
      email: operator.Email,
      mobileNumber: operator.MobileNumber,
      projectId: operator.ProjectId,
      project: operator.project ? {
        id: operator.project.Id,
        projectName: operator.project.ProjectName,
        societyName: operator.project.SocietyName
      } : null,
      parkingSystemId: operator.ParkingSystemId,
      parkingSystem: operator.parkingSystem ? {
        id: operator.parkingSystem.Id,
        wingName: operator.parkingSystem.WingName,
        type: operator.parkingSystem.Type,
        level: operator.parkingSystem.Level,
        column: operator.parkingSystem.Column
      } : null,
      status: operator.Status,
      hasPalletPower: operator.HasPalletPower,
      approvedBy: operator.ApprovedBy,
      approvedAt: operator.ApprovedAt,
      createdAt: operator.CreatedAt,
      updatedAt: operator.UpdatedAt
    }
  };
};

// Get Customers (with cars) for Operator's Project & Parking System
const getOperatorCustomersWithCars = async (operatorUserId) => {
  // Find operator by userId to determine scope
  const operator = await Operator.findOne({
    where: { UserId: operatorUserId }
  });

  if (!operator) {
    throw new Error('Operator profile not found');
  }

  if (!operator.ProjectId) {
    throw new Error('Operator is not assigned to any project');
  }

  if (!operator.ParkingSystemId) {
    throw new Error('Operator is not assigned to any parking system');
  }

  // Fetch customers belonging to operator's project and parking system
  const customers = await Customer.findAll({
    where: {
      ProjectId: operator.ProjectId,
      ParkingSystemId: operator.ParkingSystemId
    },
    include: [
      {
        model: User,
        as: 'user',
        attributes: ['Id', 'Username', 'Role', 'CreatedAt', 'UpdatedAt']
      }
    ],
    order: [['CreatedAt', 'DESC']]
  });

  // Pull all cars for these customer users in one query
  const userIds = customers.map(customer => customer.UserId);
  let carsByUserId = {};

  if (userIds.length) {
    const cars = await Car.findAll({
      where: { UserId: { [Op.in]: userIds } },
      attributes: ['Id', 'UserId', 'CarType', 'CarModel', 'CarCompany', 'CarNumber', 'CreatedAt', 'UpdatedAt'],
      order: [['CreatedAt', 'DESC']]
    });

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
      firstName: customer.FirstName,
      lastName: customer.LastName,
      email: customer.Email,
      mobileNumber: customer.MobileNumber,
      projectId: customer.ProjectId,
      parkingSystemId: customer.ParkingSystemId,
      flatNumber: customer.FlatNumber,
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

// Update Customer Status (Operator) - Approve or Reject
const updateCustomerStatus = async (operatorUserId, customerId, status) => {
  // Validate status
  if (status !== 'Approved' && status !== 'Rejected') {
    throw new Error('Status must be either "Approved" or "Rejected"');
  }

  // Validate operator exists
  const operator = await Operator.findOne({
    where: { UserId: operatorUserId }
  });

  if (!operator) {
    throw new Error('Operator profile not found');
  }

  // Validate customer exists
  const customer = await Customer.findByPk(customerId);
  if (!customer) {
    throw new Error('Customer not found');
  }

  // Ensure operator and customer belong to same project (when operator has project)
  if (operator.ProjectId && customer.ProjectId && operator.ProjectId !== customer.ProjectId) {
    throw new Error('Customer does not belong to the same project as the operator');
  }

  const istTime = getISTTime();
  await customer.update({
    Status: status,
    ApprovedBy: operatorUserId,
    ApprovedAt: istTime,
    UpdatedAt: istTime
  });

  // Reload customer to get updated values
  await customer.reload();

  const statusPayload = {
    customerId: customer.Id,
    userId: customer.UserId,
    status: customer.Status,
    approvedBy: customer.ApprovedBy,
    approvedAt: customer.ApprovedAt,
    updatedAt: customer.UpdatedAt
  };

  // Live + push so the customer app can refresh profile without re-login
  try {
    websocketService.emitToUser(customer.UserId, 'customer_status_changed', statusPayload);

    if (status === 'Approved') {
      await notificationService.notifyCustomerApproved(customer.UserId, {
        body: 'Your account has been approved. You can use the parking app now.',
        data: statusPayload
      });
    } else if (status === 'Rejected') {
      await notificationService.notifyCustomerRejected(customer.UserId, {
        body: 'Your account verification was rejected. Please contact the operator.',
        data: statusPayload
      });
    }
  } catch (notifyError) {
    console.error('[OPERATOR] Failed to notify customer of status change:', notifyError);
  }

  return {
    id: customer.Id,
    userId: customer.UserId,
    firstName: customer.FirstName,
    lastName: customer.LastName,
    email: customer.Email,
    mobileNumber: customer.MobileNumber,
    projectId: customer.ProjectId,
    parkingSystemId: customer.ParkingSystemId,
    status: customer.Status,
    approvedBy: customer.ApprovedBy,
    approvedAt: customer.ApprovedAt,
    updatedAt: customer.UpdatedAt
  };
};

// Call Empty Pallet Service
const callEmptyPallet = async (operatorUserId, customerId = null, carType) => {
  // Step 1: Find operator by userId
  const operator = await Operator.findOne({
    where: { UserId: operatorUserId },
    include: [
      {
        model: ParkingSystem,
        as: 'parkingSystem',
        attributes: ['Id', 'Type', 'Level', 'LevelBelowGround', 'Column', 'TimeForEachLevel', 'TimeForHorizontalMove', 'BufferTime']
      }
    ]
  });

  if (!operator) {
    throw new Error('Operator profile not found');
  }

  // Step 2: Validate operator has parking system assigned
  if (!operator.ParkingSystemId || !operator.parkingSystem) {
    throw new Error('Operator is not assigned to a parking system');
  }

  const parkingSystem = operator.parkingSystem;
  let pallet = null;
  let timeToCall = 0;

  // Step 3: Handle based on parking system type
  if (parkingSystem.Type === 'Tower') {
    // For Tower: Find lowest empty pallet for this car type (UserId = 0, CarId IS NULL, Released).
    // Pallet CarType null = generic slot; otherwise must match requested carType.
    if (!carType) {
      throw new Error('Car type is required for Tower parking system');
    }
    pallet = await PalletAllotment.findOne({
      where: {
        ParkingSystemId: parkingSystem.Id,
        UserId: 0,
        CarId: null,
        Status: 'Released',
        [Op.or]: [{ CarType: null }, { CarType: carType }]
      },
      order: [
        ['Level', 'ASC'],
        ['Column', 'ASC']
      ]
    });

    if (!pallet) {
      throw new Error('No empty pallet available for this car type in Tower parking system');
    }

    // Calculate time: (Level * TimePerLevel) + BufferTime
    timeToCall = (pallet.Level * parkingSystem.TimeForEachLevel) + parkingSystem.BufferTime;

  } else if (parkingSystem.Type === 'Puzzle') {
    // For Puzzle: Get customer's assigned pallet
    if (!customerId) {
      throw new Error('Customer ID is required for Puzzle parking system');
    }

    // Find customer
    const customer = await Customer.findOne({
      where: {
        Id: customerId,
        ProjectId: operator.ProjectId,
        ParkingSystemId: parkingSystem.Id
      }
    });

    if (!customer) {
      throw new Error('Customer not found or does not belong to this parking system');
    }

    // Find customer's assigned pallet
    pallet = await PalletAllotment.findOne({
      where: {
        ParkingSystemId: parkingSystem.Id,
        UserId: customer.UserId,
        Status: 'Assigned'
      }
    });

    if (!pallet) {
      throw new Error('Customer does not have an assigned pallet');
    }

    // Calculate time based on pallet location
    if (pallet.Level !== null && pallet.Level !== undefined && pallet.LevelBelowGround === null) {
      // Pallet has Level and Column (above ground)
      // Time = (Level * TimePerLevel) + HorizontalMoveTime + BufferTime
      // HorizontalMoveTime is NOT applicable for Level 1
      timeToCall = (pallet.Level * parkingSystem.TimeForEachLevel) + 
                   (pallet.Level > 1 ? parkingSystem.TimeForHorizontalMove : 0) + 
                   parkingSystem.BufferTime;
    } else if (pallet.LevelBelowGround !== null && pallet.LevelBelowGround !== undefined) {
      // Pallet has LevelBelowGround and Column (below ground)
      // Time = (LevelBelowGround * TimePerLevel) + ((LevelBelowGround * TimePerLevel) + HorizontalMoveTime + BufferTime)
      // HorizontalMoveTime is NOT applicable for LevelBelowGround 1
      // Second (LevelBelowGround * TimePerLevel) is NOT applicable for LevelBelowGround 1
      if (pallet.LevelBelowGround === 1) {
        // LevelBelowGround 1: Only (LevelBelowGround * TimePerLevel) + BufferTime
        timeToCall = (pallet.LevelBelowGround * parkingSystem.TimeForEachLevel) + parkingSystem.BufferTime;
      } else {
        // LevelBelowGround > 1: (LevelBelowGround * TimePerLevel) + ((LevelBelowGround * TimePerLevel) + HorizontalMoveTime + BufferTime)
        timeToCall = (pallet.LevelBelowGround * parkingSystem.TimeForEachLevel) + 
                     ((pallet.LevelBelowGround * parkingSystem.TimeForEachLevel) + 
                      parkingSystem.TimeForHorizontalMove + 
                      parkingSystem.BufferTime);
      }
    } else {
      throw new Error('Pallet location information is invalid');
    }
  } else {
    throw new Error('Invalid parking system type');
  }

  // Step 4: Format time in human-readable format
  const formatTime = (seconds) => {
    const minutes = Math.floor(seconds / 60);
    const remainingSeconds = seconds % 60;
    if (minutes > 0 && remainingSeconds > 0) {
      return `${minutes} minute${minutes > 1 ? 's' : ''} ${remainingSeconds} second${remainingSeconds > 1 ? 's' : ''}`;
    } else if (minutes > 0) {
      return `${minutes} minute${minutes > 1 ? 's' : ''}`;
    } else {
      return `${remainingSeconds} second${remainingSeconds > 1 ? 's' : ''}`;
    }
  };

  return {
    palletId: pallet.Id,
    palletNumber: pallet.UserGivenPalletNumber,
    carType: pallet.CarType,
    level: pallet.Level,
    levelBelowGround: pallet.LevelBelowGround,
    column: pallet.Column,
    timeToCall: timeToCall,
    timeToCallFormatted: formatTime(timeToCall),
    parkingSystem: {
      id: parkingSystem.Id,
      type: parkingSystem.Type,
      wingName: parkingSystem.WingName || null
    }
  };
};

// Call Specific Pallet Service
const callSpecificPallet = async (
  operatorUserId,
  palletId,
  requestId,
  currentFloor = 0,
  palletFloor = 0,
  tt = null,
  w310 = null,
  w313 = null
) => {
  if (tt != null && !Number.isNaN(Number(tt))) {
    console.log('[CALL-SPECIFIC-PALLET] target floor TT', {
      tt: Number(tt),
      w310,
      w313,
      requestId,
      palletId,
    });
  }
  // Step 1: Find operator by userId
  const operator = await Operator.findOne({
    where: { UserId: operatorUserId },
    include: [
      {
        model: ParkingSystem,
        as: 'parkingSystem',
        attributes: ['Id', 'Type', 'Level', 'LevelBelowGround', 'Column', 'TimeForEachLevel', 'TimeForHorizontalMove', 'BufferTime']
      }
    ]
  });

  if (!operator) {
    throw new Error('Operator profile not found');
  }

  // Step 2: Validate operator has parking system assigned
  if (!operator.ParkingSystemId || !operator.parkingSystem) {
    throw new Error('Operator is not assigned to a parking system');
  }

  // Step 3: Validate operator has project assigned
  if (!operator.ProjectId) {
    throw new Error('Operator is not assigned to a project');
  }

  const parkingSystem = operator.parkingSystem;

  // Step 4: Find the request
  const request = await Request.findOne({
    where: {
      Id: requestId,
      ProjectId: operator.ProjectId,
      ParkingSystemId: operator.ParkingSystemId,
      PalletAllotmentId: palletId
    },
    include: [
      {
        model: User,
        as: 'user',
        attributes: ['Id', 'Username', 'Role']
      }
    ]
  });

  if (!request) {
    throw new Error('Request not found or does not match the pallet');
  }

  // Step 5: Validate request status (should be Pending)
  if (request.Status !== 'Pending' && request.Status !== 'Queued') {
    throw new Error(`Cannot accept request with status: ${request.Status}. Only Pending and Queued requests can be accepted.`);
  }

  // Step 6: Find the pallet
  const pallet = await PalletAllotment.findByPk(palletId, {
    include: [
      {
        model: ParkingSystem,
        as: 'parkingSystem',
        attributes: ['Id', 'WingName', 'Type', 'Level', 'Column']
      }
    ]
  });

  if (!pallet) {
    throw new Error('Pallet not found');
  }

  // Step 7: Validate pallet belongs to operator's parking system
  if (pallet.ParkingSystemId !== operator.ParkingSystemId) {
    throw new Error('Pallet does not belong to your parking system');
  }

  // Step 8: Calculate time based on pallet location (same logic as callEmptyPallet)
  let timeToCall = 0;

  if (parkingSystem.Type === 'Tower') {
    // Tower release: CURRENT → (optional pallet) → TARGET → GROUND
    timeToCall = calculateTowerReleaseEstimatedTime({
      targetFloor: pallet.Level,
      currentFloor,
      palletFloor,
      tt,
      w310,
      w313,
    });
  } else if (parkingSystem.Type === 'Puzzle') {
    // For Puzzle: Calculate based on pallet location
    if (pallet.Level !== null && pallet.Level !== undefined && pallet.LevelBelowGround === null) {
      // Pallet has Level and Column (above ground)
      // Time = (Level * TimePerLevel) + HorizontalMoveTime + BufferTime
      // HorizontalMoveTime is NOT applicable for Level 1
      timeToCall = (pallet.Level * parkingSystem.TimeForEachLevel) + 
                   (pallet.Level > 1 ? parkingSystem.TimeForHorizontalMove : 0) + 
                   parkingSystem.BufferTime;
    } else if (pallet.LevelBelowGround !== null && pallet.LevelBelowGround !== undefined) {
      // Pallet has LevelBelowGround and Column (below ground)
      if (pallet.LevelBelowGround === 1) {
        // LevelBelowGround 1: Only (LevelBelowGround * TimePerLevel) + BufferTime
        timeToCall = (pallet.LevelBelowGround * parkingSystem.TimeForEachLevel) + parkingSystem.BufferTime;
      } else {
        // LevelBelowGround > 1: (LevelBelowGround * TimePerLevel) + ((LevelBelowGround * TimePerLevel) + HorizontalMoveTime + BufferTime)
        timeToCall = (pallet.LevelBelowGround * parkingSystem.TimeForEachLevel) + 
                     ((pallet.LevelBelowGround * parkingSystem.TimeForEachLevel) + 
                      parkingSystem.TimeForHorizontalMove + 
                      parkingSystem.BufferTime);
      }
    } else {
      throw new Error('Pallet location information is invalid');
    }
  } else {
    throw new Error('Invalid parking system type');
  }

  // Step 9: Update request status to 'Accepted' and refresh estimated time
  // UpdatedAt at this moment is the accept timestamp used by the customer countdown.
  const istTime = getISTTime();
  await request.update({
    Status: 'Accepted',
    EstimatedTime: timeToCall,
    UpdatedAt: istTime
  });

  // Step 10: Format time in minutes only for customer release ETA
  const timeToCallFormatted = formatEstimatedTimeInMinutes(timeToCall);
  const updatedAtIso = new Date(istTime).toISOString();

  // Step 12: Send notification to customer with estimated time
  if (request.user) {
    await notificationService.notifyReleaseRequestAccepted(request.UserId, {
      body: `Your car release request has been accepted. Pallet is being moved to ground level. Estimated time: ${timeToCallFormatted}.`,
      data: {
        requestId: requestId.toString(),
        palletId: palletId.toString(),
        estimatedTime: timeToCall,
        estimatedTimeFormatted: timeToCallFormatted,
        updatedAt: updatedAtIso
      }
    });
  }
  
  // Emit WebSocket event to customer
  await websocketService.emitToUser(request.UserId, 'request_accepted', {
    requestId: request.Id,
    palletId: palletId,
    carId: request.CarId,
    status: request.Status,
    estimatedTime: timeToCall,
    estimatedTimeFormatted: timeToCallFormatted,
    updatedAt: updatedAtIso
  });

  return {
    palletId: pallet.Id,
    palletNumber: pallet.UserGivenPalletNumber,
    level: pallet.Level,
    levelBelowGround: pallet.LevelBelowGround,
    column: pallet.Column,
    timeToCall: timeToCall,
    timeToCallFormatted: timeToCallFormatted,
    request: {
      id: request.Id,
      status: request.Status,
      updatedAt: request.UpdatedAt
    },
    parkingSystem: {
      id: parkingSystem.Id,
      type: parkingSystem.Type,
      wingName: parkingSystem.WingName || null
    }
  };
};

// Update Parking System Status Service
const updateParkingSystemStatus = async (operatorUserId, status) => {
  // Step 1: Validate status
  if (!PARKING_SYSTEM_STATUS_VALUES.includes(status)) {
    throw new Error(`Invalid status. Status must be one of: ${PARKING_SYSTEM_STATUS_VALUES.join(', ')}`);
  }

  // Step 2: Find operator by userId
  const operator = await Operator.findOne({
    where: { UserId: operatorUserId },
    include: [
      {
        model: ParkingSystem,
        as: 'parkingSystem',
        attributes: ['Id', 'WingName', 'Type', 'Status']
      }
    ]
  });

  if (!operator) {
    throw new Error('Operator profile not found');
  }

  // Step 3: Validate operator has parking system assigned
  if (!operator.ParkingSystemId || !operator.parkingSystem) {
    throw new Error('Operator is not assigned to a parking system');
  }

  const parkingSystem = operator.parkingSystem;

  // Step 4: Update parking system status
  const istTime = getISTTime();
  await ParkingSystem.update(
    {
      Status: status,
      UpdatedAt: istTime
    },
    {
      where: {
        Id: parkingSystem.Id
      }
    }
  );

  // Emit WebSocket event to all customers in the project
  await emitParkingSystemStatusToProjectCustomers(
    operator.ProjectId,
    parkingSystem.Id,
    status,
    istTime
  );

  // Step 5: Reload parking system to get updated data
  const updatedParkingSystem = await ParkingSystem.findByPk(parkingSystem.Id, {
    attributes: ['Id', 'WingName', 'Type', 'Level', 'LevelBelowGround', 'Column', 'Status', 'CreatedAt', 'UpdatedAt']
  });

  return {
    parkingSystem: {
      id: updatedParkingSystem.Id,
      wingName: updatedParkingSystem.WingName,
      type: updatedParkingSystem.Type,
      level: updatedParkingSystem.Level,
      levelBelowGround: updatedParkingSystem.LevelBelowGround,
      column: updatedParkingSystem.Column,
      status: updatedParkingSystem.Status,
      createdAt: updatedParkingSystem.CreatedAt,
      updatedAt: updatedParkingSystem.UpdatedAt
    }
  };
};

// Release Parked Car Service — keyed by release Request id (same completion flow as before)
const releaseParkedCar = async (operatorUserId, requestId, syncUuid = null) => {
  const liveSyncUuid = normalizeOptionalSyncUuid(syncUuid);

  // Step 1: Find operator by userId
  const operator = await Operator.findOne({
    where: { UserId: operatorUserId }
  });

  if (!operator) {
    throw new Error('Operator profile not found');
  }

  // Step 2: Validate operator has project and parking system assigned
  if (!operator.ProjectId || !operator.ParkingSystemId) {
    throw new Error('Operator is not assigned to a project and parking system');
  }

  // Step 3: Load active release request by id for this operator scope
  const request = await Request.findOne({
    where: {
      Id: requestId,
      ProjectId: operator.ProjectId,
      ParkingSystemId: operator.ParkingSystemId,
      Status: { [Op.notIn]: ['Completed', 'Cancelled'] }
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
        attributes: ['Id', 'CarType', 'CarModel', 'CarCompany', 'CarNumber']
      }
    ]
  });

  if (!request) {
    throw new Error('No active request found for this request id');
  }

  const palletId = request.PalletAllotmentId;

  // Step 4: Get parking system with time information
  const parkingSystem = await ParkingSystem.findByPk(operator.ParkingSystemId, {
    attributes: ['Id', 'WingName', 'Type', 'Level', 'LevelBelowGround', 'Column', 'TimeForEachLevel', 'TimeForHorizontalMove', 'BufferTime']
  });

  if (!parkingSystem) {
    throw new Error('Parking system not found');
  }

  // Step 5: Find the pallet
  const pallet = await PalletAllotment.findByPk(palletId, {
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
  });

  if (!pallet) {
    throw new Error('Pallet not found');
  }

  // Step 6: Validate pallet belongs to operator's parking system
  if (pallet.ParkingSystemId !== operator.ParkingSystemId) {
    throw new Error('Pallet does not belong to your parking system');
  }

  // Step 7: Validate pallet is assigned (has a customer)
  if (pallet.Status !== 'Assigned' || pallet.UserId === 0 || !pallet.CarId) {
    throw new Error('Pallet is not assigned to any customer or car');
  }

  // Step 8: Calculate time to move pallet to ground (same logic as callSpecificPallet)
  let timeToCall = 0;

  if (parkingSystem.Type === 'Tower') {
    // Tower release: (lift + traverse to car) + (return to ground without traverse)
    timeToCall = calculateTowerReleaseEstimatedTime({
      targetFloor: pallet.Level,
      currentFloor: 0,
      palletFloor: 0,
      hasPalletOnLift: false,
    });
  } else if (parkingSystem.Type === 'Puzzle') {
    // For Puzzle: Calculate based on pallet location
    if (pallet.Level !== null && pallet.Level !== undefined && pallet.LevelBelowGround === null) {
      // Pallet has Level and Column (above ground)
      // Time = (Level * TimePerLevel) + HorizontalMoveTime + BufferTime
      // HorizontalMoveTime is NOT applicable for Level 1
      timeToCall = (pallet.Level * parkingSystem.TimeForEachLevel) + 
                   (pallet.Level > 1 ? parkingSystem.TimeForHorizontalMove : 0) + 
                   parkingSystem.BufferTime;
    } else if (pallet.LevelBelowGround !== null && pallet.LevelBelowGround !== undefined) {
      // Pallet has LevelBelowGround and Column (below ground)
      if (pallet.LevelBelowGround === 1) {
        // LevelBelowGround 1: Only (LevelBelowGround * TimePerLevel) + BufferTime
        timeToCall = (pallet.LevelBelowGround * parkingSystem.TimeForEachLevel) + parkingSystem.BufferTime;
      } else {
        // LevelBelowGround > 1: (LevelBelowGround * TimePerLevel) + ((LevelBelowGround * TimePerLevel) + HorizontalMoveTime + BufferTime)
        timeToCall = (pallet.LevelBelowGround * parkingSystem.TimeForEachLevel) + 
                     ((pallet.LevelBelowGround * parkingSystem.TimeForEachLevel) + 
                      parkingSystem.TimeForHorizontalMove + 
                      parkingSystem.BufferTime);
      }
    } else {
      throw new Error('Pallet location information is invalid');
    }
  }

  // Format time in minutes only for release ETA
  const timeToCallFormatted = formatEstimatedTimeInMinutes(timeToCall);

  // Step 9: Store request ID before deletion for notification
  const resolvedRequestId = request.Id;

  // Step 10: Update request status to Completed
  const istTime = getISTTime();
  await request.update({
    Status: 'Completed',
    UpdatedAt: istTime
  });

  // Step 11: Release the pallet: set UserId to 0, CarId to null, Status to 'Released'
  await pallet.update({
    UserId: 0,
    CarId: null,
    CarType: null,
    Status: 'Released',
    UpdatedAt: istTime
  });

  // Step 12: Insert into RequestQueue as history
  await RequestQueue.create({
    UserId: request.UserId,
    PalletAllotmentId: request.PalletAllotmentId,
    ProjectId: request.ProjectId,
    ParkingSystemId: request.ParkingSystemId,
    CarId: request.CarId,
    OperatorId: operator.Id,
    Status: 'Completed',
    EstimatedTime: request.EstimatedTime,
    CreatedAt: request.CreatedAt,
    UpdatedAt: istTime
  });

  // Step 13: Delete original request
  await request.destroy();

  // Step 14: Reload pallet to get updated information
  await pallet.reload({
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
  });

  // Step 15: Send notification to customer
  if (request.user) {
    const palletInfo = pallet.UserGivenPalletNumber || `Level ${pallet.Level || pallet.LevelBelowGround}, Column ${pallet.Column}`;
    const carInfo = request.car ? `${request.car.CarCompany} ${request.car.CarModel} (${request.car.CarNumber})` : 'your car';
    
    await notificationService.notifyCarReleased(request.UserId, {
      body: `Your car ${carInfo} has been released from pallet ${palletInfo}`,
      data: {
        palletId: palletId.toString(),
        requestId: resolvedRequestId.toString()
      }
    });

    // Emit WebSocket event to customer
    await websocketService.emitToUser(request.UserId, 'car_released', {
      palletId: palletId,
      requestId: resolvedRequestId,
      carId: request.CarId,
      status: request.Status
    });
  }

  // Durable ledger so parking-sync can no-op / re-ACK this Omron row after live release.
  if (liveSyncUuid) {
    try {
      // Ensure parking phase exists when live park already completed earlier without uuid.
      await parkingSyncService.recordLiveSyncPhase({
        syncUuid: liveSyncUuid,
        phase: parkingSyncService.PHASE_PARKING,
        operator,
        palletId,
        carId: request.CarId,
        userId: request.UserId,
        parkingRequestId: null
      });
      await parkingSyncService.recordLiveSyncPhase({
        syncUuid: liveSyncUuid,
        phase: parkingSyncService.PHASE_RETRIEVAL,
        operator,
        palletId,
        carId: request.CarId,
        userId: request.UserId,
        parkingRequestId: null
      });
    } catch (ledgerError) {
      console.error('[RELEASE_PARKED_CAR] Failed to record live sync ledger:', ledgerError.message || ledgerError);
    }
  }

  return {
    pallet: {
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
      createdAt: pallet.CreatedAt,
      updatedAt: pallet.UpdatedAt
    },
    parkingSystem: pallet.parkingSystem ? {
      id: pallet.parkingSystem.Id,
      wingName: pallet.parkingSystem.WingName,
      type: pallet.parkingSystem.Type,
      level: pallet.parkingSystem.Level,
      column: pallet.parkingSystem.Column
    } : null,
    project: pallet.project ? {
      id: pallet.project.Id,
      projectName: pallet.project.ProjectName,
      societyName: pallet.project.SocietyName
    } : null,
    timeToCall: timeToCall,
    timeToCallFormatted: timeToCallFormatted,
    syncUuid: liveSyncUuid,
    message: 'Car released successfully. Request completed, logged to history, and removed from active requests. Pallet has been released.'
  };
};

// Call Pallet and Create Request Service
const callPalletAndCreateRequest = async (operatorUserId, palletId) => {
  // Step 1: Find operator by userId
  const operator = await Operator.findOne({
    where: { UserId: operatorUserId },
    include: [
      {
        model: ParkingSystem,
        as: 'parkingSystem',
        attributes: ['Id', 'Type', 'Level', 'LevelBelowGround', 'Column', 'TimeForEachLevel', 'TimeForHorizontalMove', 'BufferTime']
      }
    ]
  });

  if (!operator) {
    throw new Error('Operator profile not found');
  }

  // Step 2: Validate operator has parking system assigned
  if (!operator.ParkingSystemId || !operator.parkingSystem) {
    throw new Error('Operator is not assigned to a parking system');
  }

  // Step 3: Validate operator has project assigned
  if (!operator.ProjectId) {
    throw new Error('Operator is not assigned to a project');
  }

  const parkingSystem = operator.parkingSystem;

  // Step 4: Find the pallet
  const pallet = await PalletAllotment.findByPk(palletId, {
    include: [
      {
        model: ParkingSystem,
        as: 'parkingSystem',
        attributes: ['Id', 'WingName', 'Type', 'Level', 'Column']
      },
      {
        model: Car,
        as: 'car',
        attributes: ['Id', 'CarType', 'CarModel', 'CarCompany', 'CarNumber'],
        include: [
          {
            model: User,
            as: 'user',
            attributes: ['Id', 'Username', 'Role']
          }
        ]
      }
    ]
  });

  if (!pallet) {
    throw new Error('Pallet not found');
  }

  // Step 5: Validate pallet belongs to operator's parking system
  if (pallet.ParkingSystemId !== operator.ParkingSystemId) {
    throw new Error('Pallet does not belong to your parking system');
  }

  // Step 6: Validate pallet is assigned (has a customer and car)
  if (pallet.Status !== 'Assigned' || pallet.UserId === 0 || !pallet.CarId) {
    throw new Error('Pallet is not assigned to any customer or car');
  }

  // Step 7: Check if there's already a request for this pallet
  const existingRequest = await Request.findOne({
    where: {
      PalletAllotmentId: palletId,
      ProjectId: operator.ProjectId,
      ParkingSystemId: operator.ParkingSystemId,
      Status: { [Op.notIn]: ['Completed', 'Cancelled'] }
    }
  });

  if (existingRequest) {
    throw new Error('A request already exists for this pallet. Please use the existing request.');
  }

  // Step 8: Get customer information
  const customer = await Customer.findOne({
    where: {
      UserId: pallet.UserId,
      ProjectId: operator.ProjectId,
      ParkingSystemId: operator.ParkingSystemId
    },
    include: [
      {
        model: User,
        as: 'user',
        attributes: ['Id', 'Username', 'Role']
      }
    ]
  });

  if (!customer) {
    throw new Error('Customer not found for this pallet');
  }

  // Step 9: Calculate time based on pallet location (same logic as callSpecificPallet)
  let timeToCall = 0;

  if (parkingSystem.Type === 'Tower') {
    // Tower release: (lift + traverse to car) + (return to ground without traverse)
    timeToCall = calculateTowerReleaseEstimatedTime({
      targetFloor: pallet.Level,
      currentFloor: 0,
      palletFloor: 0,
      hasPalletOnLift: false,
    });
  } else if (parkingSystem.Type === 'Puzzle') {
    // For Puzzle: Calculate based on pallet location
    if (pallet.Level !== null && pallet.Level !== undefined && pallet.LevelBelowGround === null) {
      // Pallet has Level and Column (above ground)
      // Time = (Level * TimePerLevel) + HorizontalMoveTime + BufferTime
      // HorizontalMoveTime is NOT applicable for Level 1
      timeToCall = (pallet.Level * parkingSystem.TimeForEachLevel) + 
                   (pallet.Level > 1 ? parkingSystem.TimeForHorizontalMove : 0) + 
                   parkingSystem.BufferTime;
    } else if (pallet.LevelBelowGround !== null && pallet.LevelBelowGround !== undefined) {
      // Pallet has LevelBelowGround and Column (below ground)
      if (pallet.LevelBelowGround === 1) {
        // LevelBelowGround 1: Only (LevelBelowGround * TimePerLevel) + BufferTime
        timeToCall = (pallet.LevelBelowGround * parkingSystem.TimeForEachLevel) + parkingSystem.BufferTime;
      } else {
        // LevelBelowGround > 1: (LevelBelowGround * TimePerLevel) + ((LevelBelowGround * TimePerLevel) + HorizontalMoveTime + BufferTime)
        timeToCall = (pallet.LevelBelowGround * parkingSystem.TimeForEachLevel) + 
                     ((pallet.LevelBelowGround * parkingSystem.TimeForEachLevel) + 
                      parkingSystem.TimeForHorizontalMove + 
                      parkingSystem.BufferTime);
      }
    } else {
      throw new Error('Pallet location information is invalid');
    }
  } else {
    throw new Error('Invalid parking system type');
  }

  // Step 10: Create new release request
  const istTime = getISTTime();
  const request = await Request.create({
    UserId: pallet.UserId,
    PalletAllotmentId: palletId,
    ProjectId: operator.ProjectId,
    ParkingSystemId: operator.ParkingSystemId,
    CarId: pallet.CarId,
    OperatorId: operator.Id,
    Status: 'Pending',
    EstimatedTime: timeToCall,
    CreatedAt: istTime,
    UpdatedAt: istTime
  });

  // Step 11: Update request status to 'Accepted' (UpdatedAt = accept timestamp for countdown)
  await request.update({
    Status: 'Accepted',
    EstimatedTime: timeToCall,
    UpdatedAt: istTime
  });

  // Step 12: Format time in minutes only for customer release ETA
  const timeToCallFormatted = formatEstimatedTimeInMinutes(timeToCall);
  const updatedAtIso = new Date(istTime).toISOString();

  // Step 13: Send notification to customer with estimated time
  if (customer && customer.user) {
    await notificationService.notifyReleaseRequestAccepted(pallet.UserId, {
      body: `Your car release request has been accepted. Pallet is being moved to ground level. Estimated time: ${timeToCallFormatted}.`,
      data: {
        requestId: request.Id.toString(),
        palletId: palletId.toString(),
        estimatedTime: timeToCall,
        estimatedTimeFormatted: timeToCallFormatted,
        updatedAt: updatedAtIso
      }
    });

    // Emit WebSocket event to customer
    await websocketService.emitToUser(pallet.UserId, 'request_accepted', {
      requestId: request.Id,
      palletId: palletId,
      carId: pallet.CarId,
      status: request.Status,
      estimatedTime: timeToCall,
      estimatedTimeFormatted: timeToCallFormatted,
      updatedAt: updatedAtIso
    });
  }

  return {
    palletId: pallet.Id,
    palletNumber: pallet.UserGivenPalletNumber,
    level: pallet.Level,
    levelBelowGround: pallet.LevelBelowGround,
    column: pallet.Column,
    timeToCall: timeToCall,
    timeToCallFormatted: timeToCallFormatted,
    request: {
      id: request.Id,
      status: request.Status,
      estimatedTime: request.EstimatedTime,
      createdAt: request.CreatedAt,
      updatedAt: request.UpdatedAt
    },
    customer: customer ? {
      id: customer.Id,
      userId: customer.UserId,
      firstName: customer.FirstName,
      lastName: customer.LastName
    } : null,
    car: pallet.car ? {
      id: pallet.car.Id,
      carType: pallet.car.CarType,
      carModel: pallet.car.CarModel,
      carCompany: pallet.car.CarCompany,
      carNumber: pallet.car.CarNumber
    } : null,
    parkingSystem: {
      id: parkingSystem.Id,
      type: parkingSystem.Type,
      wingName: parkingSystem.WingName || null
    }
  };
};

// Call pallet by plate suffix — body `carNumber` is 4 digits; match last 4 of plate within ProjectId + ParkingSystemId only
const callPalletByCarNumber = async (
  operatorUserId,
  carNumber,
  currentFloor = 0,
  palletFloor = 0,
  tt = null,
  w310 = null,
  w313 = null
) => {
  if (tt != null && !Number.isNaN(Number(tt))) {
    console.log('[CALL-PALLET-BY-CAR] target floor TT', { tt: Number(tt), w310, w313, carNumber });
  }
  // Step 1: Find operator by userId
  const operator = await Operator.findOne({
    where: { UserId: operatorUserId },
    include: [
      {
        model: ParkingSystem,
        as: 'parkingSystem',
        attributes: ['Id', 'Type', 'Level', 'LevelBelowGround', 'Column', 'TimeForEachLevel', 'TimeForHorizontalMove', 'BufferTime']
      }
    ]
  });

  if (!operator) {
    throw new Error('Operator profile not found');
  }

  // Step 2: Validate operator has parking system assigned
  if (!operator.ParkingSystemId || !operator.parkingSystem) {
    throw new Error('Operator is not assigned to a parking system');
  }

  // Step 3: Validate operator has project assigned
  if (!operator.ProjectId) {
    throw new Error('Operator is not assigned to a project');
  }

  const parkingSystem = operator.parkingSystem;

  // Step 4–5: Match last 4 digits within this project + parking system; then find that car parked here (Assigned + ProjectId)
  const matchingCars = await findCarsMatchingLast4InOperatorScope(operator, carNumber);

  if (!matchingCars || matchingCars.length === 0) {
    throw new Error(`No car found with last 4 digits in this project and parking system: ${carNumber}`);
  }

  if (matchingCars.length > 1) {
    throw new Error('Multiple cars match last 4 digits in this parking system');
  }

  const parkedPallet = await PalletAllotment.findOne({
    where: {
      CarId: matchingCars[0].Id,
      ProjectId: operator.ProjectId,
      ParkingSystemId: operator.ParkingSystemId,
      Status: 'Assigned'
    },
    include: [
      {
        model: ParkingSystem,
        as: 'parkingSystem',
        attributes: ['Id', 'WingName', 'Type', 'Level', 'Column']
      },
      {
        model: Car,
        as: 'car',
        attributes: ['Id', 'UserId', 'CarType', 'CarModel', 'CarCompany', 'CarNumber'],
        include: [
          {
            model: User,
            as: 'user',
            attributes: ['Id', 'Username', 'Role']
          }
        ]
      }
    ]
  });

  if (!parkedPallet) {
    throw new Error(`Car with last 4 digits ${carNumber} is not parked in your parking system`);
  }

  // Get the car from the parked pallet (this is the car that matches both criteria)
  const car = parkedPallet.car;
  
  if (!car) {
    throw new Error('Car information not found for parked pallet');
  }

  // Step 6: Check if there's already a request for this pallet
  const existingRequest = await Request.findOne({
    where: {
      PalletAllotmentId: parkedPallet.Id,
      ProjectId: operator.ProjectId,
      ParkingSystemId: operator.ParkingSystemId,
      Status: { [Op.notIn]: ['Completed', 'Cancelled'] }
    }
  });

  if (existingRequest) {
    throw new Error('A request already exists for this car. Please use the existing request.');
  }

  // Step 7: Get customer information
  const customer = await Customer.findOne({
    where: {
      UserId: car.UserId,
      ProjectId: operator.ProjectId,
      ParkingSystemId: operator.ParkingSystemId
    },
    include: [
      {
        model: User,
        as: 'user',
        attributes: ['Id', 'Username', 'Role']
      }
    ]
  });

  if (!customer) {
    throw new Error('Customer not found for this car');
  }

  // Step 8: Calculate time based on pallet location (same logic as callSpecificPallet)
  let timeToCall = 0;

  if (parkingSystem.Type === 'Tower') {
    // Tower release: CURRENT → (optional pallet) → TARGET → GROUND
    timeToCall = calculateTowerReleaseEstimatedTime({
      targetFloor: parkedPallet.Level,
      currentFloor,
      palletFloor,
      tt,
      w310,
      w313,
    });
  } else if (parkingSystem.Type === 'Puzzle') {
    // For Puzzle: Calculate based on pallet location
    if (parkedPallet.Level !== null && parkedPallet.Level !== undefined && parkedPallet.LevelBelowGround === null) {
      // Pallet has Level and Column (above ground)
      // Time = (Level * TimePerLevel) + HorizontalMoveTime + BufferTime
      // HorizontalMoveTime is NOT applicable for Level 1
      timeToCall = (parkedPallet.Level * parkingSystem.TimeForEachLevel) + 
                   (parkedPallet.Level > 1 ? parkingSystem.TimeForHorizontalMove : 0) + 
                   parkingSystem.BufferTime;
    } else if (parkedPallet.LevelBelowGround !== null && parkedPallet.LevelBelowGround !== undefined) {
      // Pallet has LevelBelowGround and Column (below ground)
      if (parkedPallet.LevelBelowGround === 1) {
        // LevelBelowGround 1: Only (LevelBelowGround * TimePerLevel) + BufferTime
        timeToCall = (parkedPallet.LevelBelowGround * parkingSystem.TimeForEachLevel) + parkingSystem.BufferTime;
      } else {
        // LevelBelowGround > 1: (LevelBelowGround * TimePerLevel) + ((LevelBelowGround * TimePerLevel) + HorizontalMoveTime + BufferTime)
        timeToCall = (parkedPallet.LevelBelowGround * parkingSystem.TimeForEachLevel) + 
                     ((parkedPallet.LevelBelowGround * parkingSystem.TimeForEachLevel) + 
                      parkingSystem.TimeForHorizontalMove + 
                      parkingSystem.BufferTime);
      }
    } else {
      throw new Error('Pallet location information is invalid');
    }
  } else {
    throw new Error('Invalid parking system type');
  }

  // Step 9: Create new release request
  const istTime = getISTTime();
  const request = await Request.create({
    UserId: car.UserId,
    PalletAllotmentId: parkedPallet.Id,
    ProjectId: operator.ProjectId,
    ParkingSystemId: operator.ParkingSystemId,
    CarId: car.Id,
    OperatorId: operator.Id,
    Status: 'Accepted',
    EstimatedTime: timeToCall,
    CreatedAt: istTime,
    UpdatedAt: istTime
  });

  // Step 10: Format time in minutes only for customer release ETA
  const timeToCallFormatted = formatEstimatedTimeInMinutes(timeToCall);
  const updatedAtIso = new Date(istTime).toISOString();

  // Step 11: Send notification to customer
  if (customer && customer.user) {
    await notificationService.notifyReleaseRequestAccepted(car.UserId, {
      body: `Your car release request has been accepted. Pallet is being moved to ground level. Estimated time: ${timeToCallFormatted}.`,
      data: {
        requestId: request.Id.toString(),
        palletId: parkedPallet.Id.toString(),
        estimatedTime: timeToCall,
        estimatedTimeFormatted: timeToCallFormatted,
        updatedAt: updatedAtIso
      }
    });

    // Emit WebSocket event to customer
    await websocketService.emitToUser(car.UserId, 'request_accepted', {
      requestId: request.Id,
      palletId: parkedPallet.Id,
      carId: car.Id,
      status: request.Status,
      estimatedTime: timeToCall,
      estimatedTimeFormatted: timeToCallFormatted,
      updatedAt: updatedAtIso
    });
  }

  return {
    palletId: parkedPallet.Id,
    palletNumber: parkedPallet.UserGivenPalletNumber,
    level: parkedPallet.Level,
    levelBelowGround: parkedPallet.LevelBelowGround,
    column: parkedPallet.Column,
    timeToCall: timeToCall,
    timeToCallFormatted: timeToCallFormatted,
    request: {
      id: request.Id,
      status: request.Status,
      estimatedTime: request.EstimatedTime,
      createdAt: request.CreatedAt,
      updatedAt: request.UpdatedAt
    },
    customer: customer ? {
      id: customer.Id,
      userId: customer.UserId,
      firstName: customer.FirstName,
      lastName: customer.LastName
    } : null,
    car: car ? {
      id: car.Id,
      carType: car.CarType,
      carModel: car.CarModel,
      carCompany: car.CarCompany,
      carNumber: car.CarNumber
    } : null,
    parkingSystem: {
      id: parkingSystem.Id,
      type: parkingSystem.Type,
      wingName: parkingSystem.WingName || null
    }
  };
};

/**
 * Unified car-out: exactly one of carNumber (last 4 digits) or requestId.
 * - requestId: accept pending/queued release request (same as call-specific-pallet); if already Accepted, returns id only.
 * - carNumber: resolve pallet by last 4; if an open request exists (pending/queued), accept it; else create + accept as call-pallet-by-car-number.
 * - currentFloor: live lift floor from PLC FLOOR_COUNTER (building index: 0=GF, 1=TT/1F, …).
 * - palletFloor: Transporter_Pallet_Floor mapped the same way; 0 means no pallet on lift.
 * - tt: optional target-floor TT register value from Omron FloorMapping (live PLC).
 * - w310: optional W3.10 TT CC Stop (0/1); Extra TT only with pallet on lift + w310=0 + w313=1.
 * - w313: optional W3.13 CC Wise Stop (0/1).
 * Response shape for API is only { requestId } at controller layer (service returns same).
 */
const carOut = async (
  operatorUserId,
  carNumber,
  requestId,
  currentFloor = 0,
  palletFloor = 0,
  tt = null,
  w310 = null,
  w313 = null
) => {
  const hasCar = carNumber != null && String(carNumber).trim() !== '';
  const hasReq = requestId != null && requestId !== '' && !Number.isNaN(Number(requestId));
  if (hasCar === hasReq) {
    throw new Error('Provide exactly one of carNumber or requestId');
  }

  const liftFloor = Math.max(0, Number(currentFloor) || 0);
  const transporterFloor = Math.max(0, Number(palletFloor) || 0);
  const targetTt =
    tt != null && tt !== '' && !Number.isNaN(Number(tt)) ? Number(tt) : null;
  const bit310 =
    w310 != null && w310 !== '' && !Number.isNaN(Number(w310)) ? (Number(w310) !== 0 ? 1 : 0) : null;
  const bit313 =
    w313 != null && w313 !== '' && !Number.isNaN(Number(w313)) ? (Number(w313) !== 0 ? 1 : 0) : null;

  if (targetTt != null || bit310 != null || bit313 != null) {
    console.log('[CAR-OUT] target floor TT / stops received', {
      tt: targetTt,
      w310: bit310,
      w313: bit313,
      requestId,
      carNumber,
    });
  }

  const operator = await Operator.findOne({
    where: { UserId: operatorUserId },
    include: [
      {
        model: ParkingSystem,
        as: 'parkingSystem',
        attributes: ['Id', 'Type', 'Level', 'LevelBelowGround', 'Column', 'TimeForEachLevel', 'TimeForHorizontalMove', 'BufferTime']
      }
    ]
  });

  if (!operator) {
    throw new Error('Operator profile not found');
  }
  if (!operator.ParkingSystemId || !operator.parkingSystem) {
    throw new Error('Operator is not assigned to a parking system');
  }
  if (!operator.ProjectId) {
    throw new Error('Operator is not assigned to a project');
  }

  if (hasReq) {
    const rid = parseInt(requestId, 10);
    const reqRow = await Request.findOne({
      where: {
        Id: rid,
        ProjectId: operator.ProjectId,
        ParkingSystemId: operator.ParkingSystemId
      }
    });

    if (!reqRow) {
      throw new Error('Request not found or does not belong to your parking system');
    }

    if (reqRow.Status === 'Accepted') {
      return { requestId: rid, alreadyAccepted: true };
    }
    if (reqRow.Status !== 'Pending' && reqRow.Status !== 'Queued') {
      throw new Error(`Cannot accept request with status: ${reqRow.Status}. Only Pending and Queued requests can be accepted.`);
    }

    await callSpecificPallet(
      operatorUserId,
      reqRow.PalletAllotmentId,
      rid,
      liftFloor,
      transporterFloor,
      targetTt,
      bit310,
      bit313
    );
    return { requestId: rid, alreadyAccepted: false };
  }

  // carNumber (last 4) — same resolution as callPalletByCarNumber
  const matchingCars = await findCarsMatchingLast4InOperatorScope(operator, String(carNumber).trim());

  if (!matchingCars || matchingCars.length === 0) {
    throw new Error(`No car found with last 4 digits in this project and parking system: ${carNumber}`);
  }
  if (matchingCars.length > 1) {
    throw new Error('Multiple cars match last 4 digits in this parking system');
  }

  const parkedPallet = await PalletAllotment.findOne({
    where: {
      CarId: matchingCars[0].Id,
      ProjectId: operator.ProjectId,
      ParkingSystemId: operator.ParkingSystemId,
      Status: 'Assigned'
    },
    attributes: ['Id']
  });

  if (!parkedPallet) {
    throw new Error(`Car with last 4 digits ${carNumber} is not parked in your parking system`);
  }

  const existingRequest = await Request.findOne({
    where: {
      PalletAllotmentId: parkedPallet.Id,
      ProjectId: operator.ProjectId,
      ParkingSystemId: operator.ParkingSystemId,
      Status: { [Op.notIn]: ['Completed', 'Cancelled'] }
    }
  });

  if (existingRequest) {
    if (existingRequest.Status === 'Accepted') {
      return { requestId: existingRequest.Id, alreadyAccepted: true };
    }
    if (existingRequest.Status === 'Pending' || existingRequest.Status === 'Queued') {
      await callSpecificPallet(
        operatorUserId,
        parkedPallet.Id,
        existingRequest.Id,
        liftFloor,
        transporterFloor,
        targetTt,
        bit310,
        bit313
      );
      return { requestId: existingRequest.Id, alreadyAccepted: false };
    }
    throw new Error(`Cannot accept request with status: ${existingRequest.Status}`);
  }

  const created = await callPalletByCarNumber(
    operatorUserId,
    String(carNumber).trim(),
    liftFloor,
    transporterFloor,
    targetTt,
    bit310,
    bit313
  );
  return { requestId: created.request.id, alreadyAccepted: false };
};

module.exports = {
  createOperator,
  getOperatorProfile,
  getOperatorList,
  getOperatorProjectWithParkingSystems,
  carIn,
  parkCar,
  getOperatorRequests,
  updateRequestStatus,
  updateOperatorPalletPower,
  getOperatorCustomersWithCars,
  updateCustomerStatus,
  callEmptyPallet,
  updateParkingSystemStatus,
  releaseParkedCar,
  callSpecificPallet,
  callPalletAndCreateRequest,
  callPalletByCarNumber,
  carOut
};


