const mongoose = require('mongoose');

module.exports = function validateObjectId(paramName) {
  return function validateParam(req, res, next) {
    const value = req.params[paramName];

    if (!value || !mongoose.isValidObjectId(value)) {
      return res.status(400).json({ message: `Invalid ${paramName}` });
    }

    next();
  };
};
