const appConfigService = require('../services/appConfig.service');
const { successResponse, errorResponse } = require('../utils');

const resolveStatus = (message) => {
  if (message === 'appType must be either customer or operator') return 400;
  if (
    message === 'Invalid mobile version payload' ||
    message === 'Stored mobile version config is invalid JSON'
  ) {
    return 400;
  }
  return 500;
};

const getMobileVersion = async (req, res) => {
  try {
    const appType = req.params.appType;
    const result = await appConfigService.getMobileVersion(appType);
    return successResponse(
      res,
      result,
      `${result.appType} mobile version config retrieved successfully`
    );
  } catch (error) {
    console.error('Get mobile version error:', error);
    return errorResponse(
      res,
      error.message || 'Failed to retrieve mobile version config',
      resolveStatus(error.message)
    );
  }
};

const getAllMobileVersions = async (req, res) => {
  try {
    const result = await appConfigService.getAllMobileVersions();
    return successResponse(res, result, 'Mobile version configs retrieved successfully');
  } catch (error) {
    console.error('Get all mobile versions error:', error);
    return errorResponse(
      res,
      error.message || 'Failed to retrieve mobile version configs',
      resolveStatus(error.message)
    );
  }
};

const updateMobileVersion = async (req, res) => {
  try {
    const appType = req.params.appType;
    const { ios, android, message } = req.body;
    const result = await appConfigService.upsertMobileVersion(appType, { ios, android, message });
    return successResponse(
      res,
      result,
      `${result.appType} mobile version config updated successfully`
    );
  } catch (error) {
    console.error('Update mobile version error:', error);
    return errorResponse(
      res,
      error.message || 'Failed to update mobile version config',
      resolveStatus(error.message)
    );
  }
};

module.exports = {
  getMobileVersion,
  getAllMobileVersions,
  updateMobileVersion
};
