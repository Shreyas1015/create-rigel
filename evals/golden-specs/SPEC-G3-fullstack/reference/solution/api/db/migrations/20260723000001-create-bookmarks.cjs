'use strict'

/**
 * Create the `bookmarks` table (SPEC-002 / PLAN-002). Matches src/models/Bookmark.model.ts:
 * UUID PK, owner `user_id` (FK → users, ON DELETE CASCADE), url/title/note, `tags` string array,
 * `status` string (CHECK-constrained to the reading enum), timestamps + paranoid `deleted_at`.
 *
 * `.cjs` (not `.js`): the package is `"type": "module"`, so a `.js` migration would be parsed as
 * ESM and its `module.exports` would throw. Indexes are created plainly (not CONCURRENTLY): the
 * table is brand-new and empty in this same migration, so there is nothing to lock.
 */
module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.createTable('bookmarks', {
      id: { type: Sequelize.UUID, primaryKey: true, allowNull: false },
      user_id: {
        type: Sequelize.UUID,
        allowNull: false,
        references: { model: 'users', key: 'id' },
        onDelete: 'CASCADE',
        onUpdate: 'CASCADE',
      },
      url: { type: Sequelize.STRING(2048), allowNull: false },
      title: { type: Sequelize.STRING(512), allowNull: false },
      note: { type: Sequelize.TEXT, allowNull: true },
      tags: {
        type: Sequelize.ARRAY(Sequelize.STRING),
        allowNull: false,
        defaultValue: [],
      },
      status: {
        type: Sequelize.STRING,
        allowNull: false,
        defaultValue: 'unread',
      },
      created_at: { type: Sequelize.DATE, allowNull: false },
      updated_at: { type: Sequelize.DATE, allowNull: false },
      deleted_at: { type: Sequelize.DATE, allowNull: true },
    })

    // DB-level integrity for the reading enum (the model column is a plain STRING).
    await queryInterface.addConstraint('bookmarks', {
      fields: ['status'],
      type: 'check',
      name: 'bookmarks_status_check',
      where: { status: ['unread', 'reading', 'archived'] },
    })

    // Composite index backing the owner-scoped keyset list query, plus a plain user_id index.
    await queryInterface.addIndex('bookmarks', ['user_id', 'created_at', 'id'], {
      name: 'bookmarks_user_created_id',
    })
    await queryInterface.addIndex('bookmarks', ['user_id'], {
      name: 'bookmarks_user_id',
    })
  },

  async down(queryInterface) {
    // dropTable removes the table together with its indexes and the CHECK constraint.
    await queryInterface.dropTable('bookmarks')
  },
}
