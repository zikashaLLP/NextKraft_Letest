const appConfigService = require('../services/appConfig.service');
const { successResponse, errorResponse } = require('../utils');

const getMobileVersion = async (req, res) => {
  try {
    const result = await appConfigService.getMobileVersion();
    return successResponse(res, result, 'Mobile version config retrieved successfully');
  } catch (error) {
    console.error('Get mobile version error:', error);
    return errorResponse(res, error.message || 'Failed to retrieve mobile version config', 500);
  }
};

const updateMobileVersion = async (req, res) => {
  try {
    const { ios, android, message } = req.body;
    const result = await appConfigService.upsertMobileVersion({ ios, android, message });
    return successResponse(res, result, 'Mobile version config updated successfully');
  } catch (error) {
    console.error('Update mobile version error:', error);
    const statusCode =
      error.message === 'Invalid mobile version payload' ||
      error.message === 'Stored mobile version config is invalid JSON'
        ? 400
        : 500;
    return errorResponse(res, error.message || 'Failed to update mobile version config', statusCode);
  }
};

module.exports = {
  getMobileVersion,
  updateMobileVersion
};
