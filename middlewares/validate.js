const AppError = require('../utils/AppError');

/**
 * Validate request body against a Joi schema
 * Usage: validate(mySchema)
 */
const validate = (schema, source = 'body') => {
  return (req, res, next) => {
    const target = source === 'body' ? req.body : source === 'query' ? req.query : req.params;
    const { error, value } = schema.validate(target, {
      abortEarly: false,
      stripUnknown: true,
      convert: true,
    });

    if (error) {
      const message = error.details.map(d => d.message.replace(/['"]/g, '')).join(', ');
      return next(new AppError(`Validation error: ${message}`, 422));
    }

    // Replace with sanitized values
    if (source === 'body') req.body = value;
    else if (source === 'query') req.query = value;
    else req.params = value;

    next();
  };
};

module.exports = { validate };
