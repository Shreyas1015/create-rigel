'use strict'

/**
 * Create the `bookmarks` table (SPEC-G1 / PLAN-001). Matches src/models/Bookmark.model.ts:
 * UUID PK, owner `user_id`, url/title, timestamps + paranoid `deleted_at`.
 *
 * `.cjs` (not `.js`): the package is `"type": "module"`, so a `.js` migration would be parsed as
 * ESM and its `module.exports` would throw. The composite `(user_id, created_at, id)` index backs
 * the owner-scoped keyset list query; a plain `user_id` index backs the ownership lookups. Indexes
 * are created plainly (not CONCURRENTLY): the table is brand-new and empty in this same migration,
 * so there is nothing to lock.
 *
 * There is no FK to a users table: SPEC-G1 has no users table — ownership is enforced purely by
 * owner-scoped `user_id` queries in the repo (the cross-user isolation contract).
 */
module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.createTable('bookmarks', {
      id: { type: Sequelize.UUID, primaryKey: true, allowNull: false },
      user_id: { type: Sequelize.UUID, allowNull: false },
      url: { type: Sequelize.STRING(2048), allowNull: false },
      title: { type: Sequelize.STRING(200), allowNull: false },
      created_at: { type: Sequelize.DATE, allowNull: false },
      updated_at: { type: Sequelize.DATE, allowNull: false },
      deleted_at: { type: Sequelize.DATE, allowNull: true },
    })

    await queryInterface.addIndex('bookmarks', ['user_id', 'created_at', 'id'], {
      name: 'bookmarks_user_created_id',
    })
    await queryInterface.addIndex('bookmarks', ['user_id'], {
      name: 'bookmarks_user_id',
    })
  },

  async down(queryInterface) {
    // dropTable removes the table together with its indexes.
    await queryInterface.dropTable('bookmarks')
  },
}
