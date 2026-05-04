/**
 * Send a standardized success response
 */
const sendSuccess = (res, { statusCode = 200, message = 'Success', data = null, meta = null } = {}) => {
  const response = { success: true, message };
  if (data !== null) response.data = data;
  if (meta !== null) response.meta = meta;
  return res.status(statusCode).json(response);
};

/**
 * Send a standardized error response (use AppError + errorHandler instead when possible)
 */
const sendError = (res, { statusCode = 500, message = 'Internal server error' } = {}) => {
  return res.status(statusCode).json({ success: false, message });
};

/**
 * Build pagination meta from query params and total count
 */
const buildPaginationMeta = (page, limit, total) => ({
  currentPage: page,
  totalPages: Math.ceil(total / limit),
  totalItems: total,
  itemsPerPage: limit,
  hasNextPage: page < Math.ceil(total / limit),
  hasPrevPage: page > 1,
});

module.exports = { sendSuccess, sendError, buildPaginationMeta };
