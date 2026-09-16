const mongoose = require('mongoose');

module.exports = function validateObjectId(paramName) {
  return function validateParam(req, res, next) {
    const value = req.params[paramName];

    if (paramName === 'ladderId' && typeof value === 'string' && value.startsWith('default-')) {
      return next();
    }

    if (paramName === 'questionId' && typeof value === 'string') {
      if (mongoose.isValidObjectId(value)) {
        return next();
      }
      try {
        const questionCatalog = require('../services/questionCatalog');
        const catQ = questionCatalog.getQuestionById(value) ||
          (value.includes(':') ? questionCatalog.getQuestionByPlatformAndExternalId(...value.split(':')) : null);
        if (catQ?._id && mongoose.isValidObjectId(catQ._id)) {
          req.params[paramName] = String(catQ._id);
          return next();
        }
      } catch {}
    }

    if (!value || !mongoose.isValidObjectId(value)) {
      return res.status(400).json({ message: `Invalid ${paramName}` });
    }

    next();
  };
};
