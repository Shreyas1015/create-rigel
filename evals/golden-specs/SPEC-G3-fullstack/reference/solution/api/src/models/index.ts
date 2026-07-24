/**
 * Model registration — the single legal `models → config` edge. Products register their
 * Sequelize model classes here via `sequelize.addModels([...])`. `reflect-metadata` MUST be
 * imported before any decorated model is loaded.
 */
import 'reflect-metadata'
import { sequelize } from '../config/database.js'
import { User } from './User.model.js'
import { Bookmark } from './Bookmark.model.js'

// Products add model classes here, e.g. sequelize.addModels([User, Bookmark]).
sequelize.addModels([User, Bookmark])

export { sequelize, User, Bookmark }
