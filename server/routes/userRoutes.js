const router = require('express').Router();
const { protect, authorize } = require('../middleware/authMiddleware');
const { list, create, update } = require('../controllers/userController');
router.use(protect, authorize('admin', 'librarian'));
router.get('/', list);
router.post('/', create);
router.put('/:id', update);
module.exports = router;
