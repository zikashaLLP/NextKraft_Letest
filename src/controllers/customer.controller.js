const customerService = require('../services/customer.service');
const { successResponse, errorResponse } = require('../utils');

// Create Customer Controller (No authentication required)
const createCustomer = async (req, res) => {
  try {
    const { username, password, firstName, lastName, email, mobileNumber, projectId, parkingSystemId, flatNumber, profession } = req.body;
    
    // No admin authentication - customer creates their own account
    // Status will be set to 'Pending' and requires admin approval
    const result = await customerService.createCustomer({
      Username: username,
      Password: password,
      FirstName: firstName,
      LastName: lastName,
      Email: email,
      MobileNumber: mobileNumber,
      ProjectId: projectId,
      ParkingSystemId: parkingSystemId,
      FlatNumber: flatNumber,
      Profession: profession
    });
    
    return successResponse(res, result, 'Customer created successfully. Account is pending admin approval.', 201);
  } catch (error) {
    console.error('Create customer error:', error);
    const statusCode = error.message === 'Username already exists' ||
                       error.message === 'Email already exists' ||
                       error.message === 'Email is required'
      ? 400
      : error.message === 'Project not found' || error.message === 'Parking system not found'
        ? 404
        : error.message.includes('required')
          ? 400
          : 500;
    return errorResponse(res, error.message || 'Failed to create customer', statusCode);
  }
};

// Get Customer Profile Controller
const getCustomerProfile = async (req, res) => {
  try {
    const userId = req.user.id; // Get userId from authenticated session
    
    const result = await customerService.getCustomerProfile(userId);
    
    return successResponse(res, result, 'Customer profile retrieved successfully');
  } catch (error) {
    console.error('Get customer profile error:', error);
    const statusCode = error.message === 'Customer profile not found' ? 404 : 500;
    return errorResponse(res, error.message || 'Failed to retrieve customer profile', statusCode);
  }
};

// Update Customer Profile Controller
const updateCustomerProfile = async (req, res) => {
  try {
    const userId = req.user.id;
    const { firstName, lastName, email, mobileNumber, flatNumber, profession } = req.body;

    const result = await customerService.updateCustomerProfile(userId, {
      FirstName: firstName,
      LastName: lastName,
      Email: email,
      MobileNumber: mobileNumber,
      FlatNumber: flatNumber,
      Profession: profession
    });

    return successResponse(res, result, 'Customer profile updated successfully');
  } catch (error) {
    console.error('Update customer profile error:', error);
    const statusCode =
      error.message === 'Customer profile not found'
        ? 404
        : error.message === 'Email already exists' ||
            error.message === 'Email is required' ||
            error.message === 'At least one profile field is required to update'
          ? 400
          : 500;
    return errorResponse(res, error.message || 'Failed to update customer profile', statusCode);
  }
};

const resolveCarMutationStatus = (message) => {
  if (message === 'Car not found') return 404;
  if (message === 'Car number already exists') return 400;
  if (
    message === 'Cannot modify car while an accepted parking request exists for this car' ||
    message === 'Cannot modify car while an accepted release request exists for this car' ||
    message === 'Cannot delete car while it is parked or assigned to a pallet'
  ) {
    return 409;
  }
  return 500;
};

// Create Car Controller
const createCar = async (req, res) => {
  try {
    const { carType, carModel, carCompany, carNumber } = req.body;
    const userId = req.user.id; // Get userId from authenticated session
    
    const result = await customerService.createCar({
      UserId: userId,
      CarType: carType,
      CarModel: carModel,
      CarCompany: carCompany,
      CarNumber: carNumber
    });
    
    return successResponse(res, result, 'Car added successfully', 201);
  } catch (error) {
    console.error('Create car error:', error);
    const statusCode = error.message === 'Car number already exists' ? 400 : 500;
    return errorResponse(res, error.message || 'Failed to add car', statusCode);
  }
};

// Update Car Controller
const updateCar = async (req, res) => {
  try {
    const userId = req.user.id;
    const carId = parseInt(req.params.carId, 10);
    const { carType, carModel, carCompany, carNumber } = req.body;

    const result = await customerService.updateCar(userId, carId, {
      CarType: carType,
      CarModel: carModel,
      CarCompany: carCompany,
      CarNumber: carNumber
    });

    return successResponse(res, result, 'Car updated successfully');
  } catch (error) {
    console.error('Update car error:', error);
    return errorResponse(res, error.message || 'Failed to update car', resolveCarMutationStatus(error.message));
  }
};

// Delete Car Controller
const deleteCar = async (req, res) => {
  try {
    const userId = req.user.id;
    const carId = parseInt(req.params.carId, 10);

    const result = await customerService.deleteCar(userId, carId);

    return successResponse(res, result, 'Car deleted successfully');
  } catch (error) {
    console.error('Delete car error:', error);
    return errorResponse(res, error.message || 'Failed to delete car', resolveCarMutationStatus(error.message));
  }
};

// Get Car List Controller
const getCarList = async (req, res) => {
  try {
    const userId = req.user.id; // Get userId from authenticated session
    
    const result = await customerService.getCarList(userId);
    
    return successResponse(res, { cars: result, count: result.length }, 'Car list retrieved successfully');
  } catch (error) {
    console.error('Get car list error:', error);
    return errorResponse(res, error.message || 'Failed to retrieve car list', 500);
  }
};

// Get Available Car List Controller (cars that are not parked)
const getAvailableCarList = async (req, res) => {
  try {
    const userId = req.user.id; // Get userId from authenticated session
    
    const result = await customerService.getAvailableCarList(userId);
    
    return successResponse(res, { cars: result, count: result.length }, 'Available car list retrieved successfully');
  } catch (error) {
    console.error('Get available car list error:', error);
    return errorResponse(res, error.message || 'Failed to retrieve available car list', 500);
  }
};

// Get Customer Pallet Status Controller
const getCustomerPalletStatus = async (req, res) => {
  try {
    const userId = req.user.id; // Get userId from authenticated session
    
    const result = await customerService.getCustomerPalletStatus(userId);
    
    return successResponse(res, { 
      pallets: result.pallets, 
      count: result.pallets.length,
      parkRequests: result.parkRequests
    }, 'Pallet status retrieved successfully');
  } catch (error) {
    console.error('Get customer pallet status error:', error);
    return errorResponse(res, error.message || 'Failed to retrieve pallet status', 500);
  }
};

// Request Car Release Controller
const requestCarRelease = async (req, res) => {
  try {
    const { palletId } = req.body;
    const userId = req.user.id; // Get userId from authenticated session
    
    const result = await customerService.requestCarRelease(userId, parseInt(palletId));
    
    return successResponse(res, result, 'Car release request submitted successfully');
  } catch (error) {
    console.error('Request car release error:', error);
    const statusCode = error.message === 'Pallet not found or not assigned to you' ||
                       error.message === 'No operator assigned to this parking system. Please contact administrator' ? 404 :
                       error.message === 'A request for this pallet is already pending or in progress' ? 400 : 500;
    return errorResponse(res, error.message || 'Failed to submit car release request', statusCode);
  }
};

// Get Customer Requests Controller
const getCustomerRequests = async (req, res) => {
  try {
    const userId = req.user.id; // Get userId from authenticated session
    
    const result = await customerService.getCustomerRequests(userId);
    
    return successResponse(res, { requests: result, count: result.length }, 'Customer requests retrieved successfully');
  } catch (error) {
    console.error('Get customer requests error:', error);
    return errorResponse(res, error.message || 'Failed to retrieve customer requests', 500);
  }
};

// Get Customer List Controller (Admin and Operator)
const getCustomerList = async (req, res) => {
  try {
    const userId = req.user.id; // Get userId from authenticated session
    const userRole = req.user.role; // Get role from authenticated session
    
    const result = await customerService.getCustomerList(userId, userRole);
    
    return successResponse(res, { customers: result, count: result.length }, 'Customer list retrieved successfully');
  } catch (error) {
    console.error('Get customer list error:', error);
    const statusCode = error.message === 'Operator profile not found' ||
                       error.message === 'Operator is not assigned to any project' ? 404 : 500;
    return errorResponse(res, error.message || 'Failed to retrieve customer list', statusCode);
  }
};

// Get Customers with Cars by Project IDs Controller (Admin only)
const getCustomersWithCarsByProjectIds = async (req, res) => {
  try {
    const { projectIds } = req.body;
    
    if (!projectIds) {
      return errorResponse(res, 'Project IDs array is required', 400);
    }
    
    const result = await customerService.getCustomersWithCarsByProjectIds(projectIds);
    
    return successResponse(res, result, 'Customers with cars retrieved successfully');
  } catch (error) {
    console.error('Get customers with cars by project IDs error:', error);
    const statusCode = error.message === 'Project IDs array is required and cannot be empty' ||
                      error.message === 'No valid project IDs provided' ? 400 : 500;
    return errorResponse(res, error.message || 'Failed to retrieve customers with cars', statusCode);
  }
};

module.exports = {
  createCustomer,
  getCustomerProfile,
  updateCustomerProfile,
  createCar,
  updateCar,
  deleteCar,
  getCarList,
  getAvailableCarList,
  getCustomerPalletStatus,
  requestCarRelease,
  getCustomerRequests,
  getCustomerList,
  getCustomersWithCarsByProjectIds
};

