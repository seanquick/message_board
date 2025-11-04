// Backend/Routes/user.js
const express = require('express');
const router = express.Router();
const User = require('../Models/User');
const { requireAuth } = require('../Middleware/auth');

// ===== PUBLIC PROFILE VIEW =====
// GET /api/users/:id — View public profile by ID
router.get('/:id', async (req, res) => {
  try {
    const user = await User.findById(req.params.id).lean();
    if (!user || user.deletedAt) {
      return res.status(404).json({ error: 'User not found' });
    }

    res.json({
      _id: user._id,
      name: user.name,
      displayName: user.displayName || '',
      bio: user.bio || '',
      favoriteQuote: user.favoriteQuote || '',
      profilePhoto: user.profilePhoto || ''
    });
  } catch (err) {
    console.error('[GET /users/:id] Error:', err);
    res.status(500).json({ error: 'Failed to fetch profile' });
  }
});


// ===== GET OWN PROFILE =====
// GET /api/users/profile — Return the authenticated user's profile
router.get('/profile', requireAuth, async (req, res) => {
  try {
    const user = await User.findById(req.user.uid).lean();
    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }

    res.json({
      _id: user._id,
      name: user.name,
      displayName: user.displayName || '',
      bio: user.bio || '',
      favoriteQuote: user.favoriteQuote || '',
      profilePhoto: user.profilePhoto || ''
    });
  } catch (err) {
    console.error('[GET /users/profile] Error:', err);
    res.status(500).json({ error: 'Failed to load profile' });
  }
});


// ===== UPDATE OWN PROFILE =====
// POST /api/users/profile — Authenticated user updates their own profile
router.post('/profile', requireAuth, async (req, res) => {
  try {
    const { displayName = '', bio = '', favoriteQuote = '', profilePhoto = '' } = req.body;

    const updates = {
      displayName: displayName.trim(),
      bio: bio.trim(),
      favoriteQuote: favoriteQuote.trim(),
      profilePhoto: profilePhoto.trim()
    };

    const user = await User.findByIdAndUpdate(req.user.uid, updates, { new: true, lean: true });
    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }

    res.json({
      success: true,
      profile: {
        _id: user._id,
        displayName: user.displayName,
        bio: user.bio,
        favoriteQuote: user.favoriteQuote,
        profilePhoto: user.profilePhoto
      }
    });
  } catch (err) {
    console.error('[POST /users/profile] Error:', err);
    res.status(500).json({ error: 'Failed to update profile' });
  }
});

module.exports = router;
