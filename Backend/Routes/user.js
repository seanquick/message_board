// Backend/Routes/user.js
const express = require('express');
const router = express.Router();
const User = require('../Models/User');
const { requireAuth } = require('../Middleware/auth');

// ✅ Import upload handlers
const { uploadSingle, processAndUpload } = require('../Services/uploadPhoto');

// ===== GET OWN PROFILE =====
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
      profilePhoto: user.profilePhotoUrl || '/default-avatar.png'
    });
  } catch (err) {
    console.error('[GET /users/profile] Error:', err);
    res.status(500).json({ error: 'Failed to load profile' });
  }
});

// ===== UPDATE OWN PROFILE =====
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
        profilePhoto: user.profilePhotoUrl || '/default-avatar.png'
      }
    });
  } catch (err) {
    console.error('[POST /users/profile] Error:', err);
    res.status(500).json({ error: 'Failed to update profile' });
  }
});

// ===== UPLOAD PROFILE PHOTO =====
router.post('/profile/photo', requireAuth, uploadSingle, async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: 'No file uploaded' });
    }

    const url = await processAndUpload(req.file.buffer, req.file.originalname, req.file.mimetype);

    const user = await User.findByIdAndUpdate(
      req.user.uid,
      { profilePhotoUrl: url },
      { new: true, lean: true }
    );
    if (!user) return res.status(404).json({ error: 'User not found' });

    res.json({ success: true, profilePhotoUrl: user.profilePhotoUrl });
  } catch (err) {
    console.error('[POST /users/profile/photo] Error:', err);
    res.status(500).json({ error: 'Photo upload failed' });
  }
});

// ===== PUBLIC PROFILE VIEW =====
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
      profilePhoto: user.profilePhotoUrl || '/default-avatar.png'
    });
  } catch (err) {
    console.error('[GET /users/:id] Error:', err);
    res.status(500).json({ error: 'Failed to fetch profile' });
  }
});

// Backend/Routes/user.js

// ===== LIST ALL (PUBLIC) PROFILES =====
// GET /api/users  — Return minimal public info of all users who have set up profile
router.get('/', async (req, res) => {
  try {
    const users = await User.find(
      { /* optionally filter e.g. displayName exists */ },
      {
        _id: 1,
        name: 1,
        displayName: 1,
        profilePhoto: 1,
        profilePhotoUrl: 1
      }
    ).lean();

    // Map to minimal response
    const list = users.map(u => ({
      _id: u._id,
      name: u.name,
      displayName: u.displayName || u.name,
      photoUrl: (u.profilePhotoUrl || u.profilePhoto || '/default-avatar.png')
    }));

    res.json({ users: list });
  } catch (err) {
    console.error('[GET /users] Error:', err);
    res.status(500).json({ error: 'Failed to fetch users list' });
  }
});

module.exports = router;
