// Backend/Routes/profile.js
const express = require('express');
const router = express.Router();
const User = require('../Models/User');

// GET /api/profile/:userId — Public view of a user profile
router.get('/:userId', async (req, res) => {
  try {
    const user = await User.findById(req.params.userId).lean();

    if (!user || user.deletedAt) {
      return res.status(404).json({ error: 'User not found' });
    }

    res.json({
      name: user.name,
      bio: user.bio || '',
      photoUrl: user.photoUrl || '',
      favoriteQuotes: Array.isArray(user.favoriteQuotes) ? user.favoriteQuotes : []
    });
  } catch (err) {
    console.error('[profile view] error:', err);
    res.status(500).json({ error: 'Failed to load profile' });
  }
});

module.exports = router;
