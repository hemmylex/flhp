const validate = (schema) => (req, res, next) => {
  try {
    req.body = schema.parse(req.body);

    next();
  } catch (error) {
    console.error("VALIDATION ERROR:", error);

    return res.status(400).json({
      success: false,
      message: "Validation failed",
      errors: error.issues?.map((issue) => ({
        field: issue.path[0],
        message: issue.message,
      })) || [],
    });
  }
};

export default validate;