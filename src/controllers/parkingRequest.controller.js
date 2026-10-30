const parkingRequestService = require('../services/parkingRequest.service');
const { successResponse, errorResponse } = require('../utils');

// Customer: create parking request
const createParkingRequest = async (req, res) => {
  try {
    const userId = req.user.id;
    const { carId } = req.body;

    const result = await parkingRequestService.createParkingRequest(userId, parseInt(carId));

    return successResponse(res, result, 'Parking request created successfully', 201);
  } catch (error) {
    console.error('Create parking request error:', error);
    const statusCode = error.message === 'Car not found for this user' ||
                       error.message === 'Customer profile not found' ||
                       error.message === 'No operator assigned to this parking system'
      ? 404
      : error.message === 'Customer is not assigned to a project and parking system' ||
        error.message.includes('An active parking request already exists') ||
        error.message.includes('This car is already parked')
      ? 400
      : 500;
    return errorResponse(res, error.message || 'Failed to create parking request', statusCode);
  }
};

// Operator: list parking requests
const getOperatorParkingRequests = async (req, res) => {
  try {
    const operatorUserId = req.user.id;
    const result = await parkingRequestService.getOperatorParkingRequests(operatorUserId);

    return successResponse(res, { parkingRequests: result, count: result.length }, 'Parking requests retrieved successfully');
  } catch (error) {
    console.error('Get operator parking requests error:', error);
    const statusCode = error.message === 'Operator profile not found' ? 404 : 500;
    return errorResponse(res, error.message || 'Failed to retrieve parking requests', statusCode);
  }
};

// Operator or customer: update parking request status
// Customer may only set Cancelled while the request is Pending.
const updateParkingRequestStatus = async (req, res) => {
  try {
    const actorUserId = req.user.id;
    const actorRole = req.user.role;
    const { requestId } = req.params;
    const { status } = req.body;

    const result = await parkingRequestService.updateParkingRequestStatus(
      actorUserId,
      parseInt(requestId, 10),
      status,
      actorRole
    );

    return successResponse(res, result, 'Parking request status updated successfully');
  } catch (error) {
    console.error('Update parking request status error:', error);
    const statusCode = error.message === 'Operator profile not found' ||
                       error.message === 'Parking request not found or not assigned to you' ? 404 :
                       error.message.startsWith('Invalid status transition') ||
                       error.message.startsWith('Customers can only') ? 400 : 500;
    return errorResponse(res, error.message || 'Failed to update parking request status', statusCode);
  }
};

module.exports = {
  createParkingRequest,
  getOperatorParkingRequests,
  updateParkingRequestStatus
};



