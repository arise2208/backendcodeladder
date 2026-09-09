const mongoose = require('mongoose');
const Ladder = require('../models/Ladder');
const LadderMember = require('../models/LadderMember');

async function loadLadderAccess(req, res, next) {
  try {
    const ladderId = req.params.ladderId;

    if (!ladderId || !mongoose.isValidObjectId(ladderId)) {
      return res.status(400).json({ message: 'Invalid ladderId' });
    }

    const ladder = await Ladder.findById(ladderId);

    if (!ladder) {
      return res.status(404).json({ message: 'Ladder not found' });
    }

    if (!req.user) {
      return res.status(401).json({ message: 'Authentication required' });
    }

    if (String(ladder.ownerId) === String(req.user.id) || req.user.role === 'ADMIN') {
      req.ladder = ladder;
      req.ladderAccess = { isOwner: true, role: 'OWNER' };
      return next();
    }

    const membership = await LadderMember.findOne({
      ladderId: ladder._id,
      userId: req.user.id
    }).select('role');

    if (!membership) {
      if (ladder.isPublic) {
        req.ladder = ladder;
        req.ladderAccess = {
          isOwner: false,
          role: 'READ',
          isPublicViewer: true
        };
        return next();
      }
      return res.status(403).json({ message: 'You do not have access to this ladder' });
    }

    req.ladder = ladder;
    req.ladderAccess = {
      isOwner: false,
      role: membership.role
    };

    next();
  } catch (error) {
    next(error);
  }
}

function requireLadderAccess(req, res, next) {
  if (!req.ladderAccess) {
    return res.status(500).json({ message: 'Ladder access middleware not initialized' });
  }
  next();
}

function requireLadderWrite(req, res, next) {
  if (!req.ladderAccess) {
    return res.status(500).json({ message: 'Ladder access middleware not initialized' });
  }

  if (req.ladderAccess.isOwner || req.ladderAccess.role === 'WRITE') {
    return next();
  }

  return res.status(403).json({ message: 'Write access required' });
}

function requireLadderOwner(req, res, next) {
  if (!req.ladderAccess) {
    return res.status(500).json({ message: 'Ladder access middleware not initialized' });
  }

  if (req.ladderAccess.isOwner) {
    return next();
  }

  return res.status(403).json({ message: 'Owner access required' });
}

module.exports = {
  loadLadderAccess,
  requireLadderAccess,
  requireLadderWrite,
  requireLadderOwner
};
