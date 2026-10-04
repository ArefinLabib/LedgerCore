export function requireRole(...allowedRoles) {
    return function (req, res, next) {
        if (!req.user || !req.user.role) {
            return res.status(401).json({
                success: false,
                message: "Unauthorized: Missing authentication context"
            });
        }

        const hasPermission = allowedRoles.includes(req.user.role);

        if (!hasPermission) {
            return res.status(403).json({
                success: false,
                message: `Forbidden: Insufficient privileges. Required role: [${allowedRoles.join(', ')}]`
            });
        }

        next();
    };
}
