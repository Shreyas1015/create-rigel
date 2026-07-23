/**
 * Bookmark Sequelize model (Models layer — schema only, no logic). Soft-deleted (`paranoid`),
 * UUIDv7 primary key, owner column `userId`.
 *
 * Column names are snake_cased (`underscored`); `.toJSON()` still returns the camelCase attribute
 * names the repo's `BookmarkSchema` validates. The composite `(user_id, created_at, id)` index
 * backs the owner-scoped keyset list query (`WHERE user_id = ? ORDER BY created_at DESC, id DESC`).
 */
import { AllowNull, Column, DataType, Default, Model, PrimaryKey, Table } from 'sequelize-typescript'
import { newId } from '../utils/uuid.util.js'

@Table({
  tableName: 'bookmarks',
  paranoid: true,
  underscored: true,
  indexes: [
    { name: 'bookmarks_user_created_id', fields: ['user_id', 'created_at', 'id'] },
    { name: 'bookmarks_user_id', fields: ['user_id'] },
  ],
})
export class Bookmark extends Model {
  @PrimaryKey
  @Default(() => newId())
  @Column(DataType.UUID)
  declare id: string

  @AllowNull(false)
  @Column(DataType.UUID)
  declare userId: string

  @AllowNull(false)
  @Column(DataType.STRING(2048))
  declare url: string

  @AllowNull(false)
  @Column(DataType.STRING(200))
  declare title: string
}
