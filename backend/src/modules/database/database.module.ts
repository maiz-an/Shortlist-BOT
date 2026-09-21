import { BadRequestException, Controller, Get, Injectable, Module, NotFoundException, Param, Query, Res } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { Type } from 'class-transformer';
import { IsIn, IsInt, IsOptional, IsString, Max, MaxLength, Min } from 'class-validator';
import type { Response } from 'express';
import { PrismaService } from '../../prisma/prisma.service';

export interface ColumnInfo {
  name: string;
  type: string;
  nullable: boolean;
  default: string | null;
}

const HIDDEN = /token|secret|password/i;
const CELL_LIMIT = 300;
const EXPORT_LIMIT = 10000;

const q = (ident: string) => `"${ident.replace(/"/g, '""')}"`;

/** Makes a raw Postgres value JSON-safe and hides secrets. */
function clean(column: string, value: unknown, truncate: boolean): unknown {
  if (value === null || value === undefined) return null;
  if (HIDDEN.test(column)) return '[hidden]';
  if (typeof value === 'bigint') return Number(value);
  if (value instanceof Date) return value.toISOString();
  if (typeof value === 'string' && truncate && value.length > CELL_LIMIT) return `${value.slice(0, CELL_LIMIT)}…`;
  if (typeof value === 'object' && truncate) {
    const s = JSON.stringify(value);
    return s.length > CELL_LIMIT ? `${s.slice(0, CELL_LIMIT)}…` : value;
  }
  return value;
}

function csvCell(v: unknown): string {
  if (v === null || v === undefined) return '';
  const s = typeof v === 'object' ? JSON.stringify(v) : String(v);
  return /[",\r\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

/** Read-only inspection of the application database. Every identifier is checked against the real schema. */
@Injectable()
export class DatabaseService {
  private readonly allowed: string[];

  constructor(private readonly prisma: PrismaService) {
    const models = Prisma.dmmf.datamodel.models.map((m) => m.dbName ?? m.name);
    this.allowed = [...models, '_ProfileSources'].sort((a, b) => a.localeCompare(b));
  }

  private assertTable(name: string) {
    if (!this.allowed.includes(name)) throw new NotFoundException('Unknown table');
    return name;
  }

  async columns(table: string): Promise<ColumnInfo[]> {
    this.assertTable(table);
    const rows = await this.prisma.$queryRawUnsafe<{ column_name: string; data_type: string; udt_name: string; is_nullable: string; column_default: string | null }[]>(
      `SELECT column_name, data_type, udt_name, is_nullable, column_default FROM information_schema.columns
       WHERE table_schema = 'public' AND table_name = $1 ORDER BY ordinal_position`,
      table,
    );
    return rows.map((r) => ({
      name: r.column_name,
      type: r.data_type === 'USER-DEFINED' ? `enum ${r.udt_name}` : r.data_type === 'ARRAY' ? `${r.udt_name.replace(/^_/, '')}[]` : r.data_type,
      nullable: r.is_nullable === 'YES',
      default: r.column_default,
    }));
  }

  async overview() {
    const tables = await Promise.all(
      this.allowed.map(async (name) => {
        const [{ count }] = await this.prisma.$queryRawUnsafe<{ count: bigint }[]>(`SELECT COUNT(*) AS count FROM ${q(name)}`);
        return { name, rows: Number(count) };
      }),
    );
    const info = await this.prisma
      .$queryRawUnsafe<{ version: string; size: bigint | null }[]>(`SELECT version() AS version, pg_database_size(current_database()) AS size`)
      .catch(() => this.prisma.$queryRawUnsafe<{ version: string; size: null }[]>(`SELECT version() AS version, NULL AS size`));
    return {
      version: info[0]?.version?.split(' on ')[0] ?? 'PostgreSQL',
      sizeBytes: info[0]?.size != null ? Number(info[0].size) : null,
      tables,
      totalRows: tables.reduce((n, t) => n + t.rows, 0),
    };
  }

  async rows(table: string, opts: { page: number; pageSize: number; q?: string; sort?: string; order: 'asc' | 'desc' }) {
    const cols = await this.columns(table);
    const names = cols.map((c) => c.name);
    const sort = opts.sort && names.includes(opts.sort) ? opts.sort : names.includes('createdAt') ? 'createdAt' : names[0];
    const dir = opts.order === 'asc' ? 'ASC' : 'DESC';
    const params: unknown[] = [];
    let where = '';
    if (opts.q?.trim()) {
      params.push(`%${opts.q.trim()}%`);
      // Secret columns are never searchable, so their contents cannot be probed.
      where = `WHERE (${cols.filter((c) => !HIDDEN.test(c.name)).map((c) => `${q(c.name)}::text ILIKE $1`).join(' OR ')})`;
    }
    const [{ count }] = await this.prisma.$queryRawUnsafe<{ count: bigint }[]>(`SELECT COUNT(*) AS count FROM ${q(table)} ${where}`, ...params);
    const data = await this.prisma.$queryRawUnsafe<Record<string, unknown>[]>(
      `SELECT * FROM ${q(table)} ${where} ORDER BY ${q(sort)} ${dir} NULLS LAST LIMIT ${opts.pageSize} OFFSET ${(opts.page - 1) * opts.pageSize}`,
      ...params,
    );
    return {
      table, columns: cols, sort, order: dir.toLowerCase(),
      total: Number(count), page: opts.page, pageSize: opts.pageSize,
      rows: data.map((r) => Object.fromEntries(names.map((n) => [n, clean(n, r[n], true)]))),
    };
  }

  async row(table: string, id: string) {
    const cols = await this.columns(table);
    if (!cols.some((c) => c.name === 'id')) throw new BadRequestException('This table has no id column');
    const [r] = await this.prisma.$queryRawUnsafe<Record<string, unknown>[]>(`SELECT * FROM ${q(table)} WHERE "id"::text = $1 LIMIT 1`, id);
    if (!r) throw new NotFoundException('Row not found');
    return Object.fromEntries(cols.map((c) => [c.name, clean(c.name, r[c.name], false)]));
  }

  async exportTable(table: string, format: 'csv' | 'json') {
    const cols = await this.columns(table);
    const names = cols.map((c) => c.name);
    const data = await this.prisma.$queryRawUnsafe<Record<string, unknown>[]>(`SELECT * FROM ${q(table)} LIMIT ${EXPORT_LIMIT}`);
    const rows = data.map((r) => Object.fromEntries(names.map((n) => [n, clean(n, r[n], false)])));
    if (format === 'json') return { type: 'application/json', body: JSON.stringify(rows, null, 2) };
    const lines = [names.map(csvCell).join(','), ...rows.map((r) => names.map((n) => csvCell(r[n])).join(','))];
    return { type: 'text/csv; charset=utf-8', body: '﻿' + lines.join('\r\n') };
  }
}

class RowsQuery {
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) page?: number;
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) @Max(200) pageSize?: number;
  @IsOptional() @IsString() @MaxLength(100) q?: string;
  @IsOptional() @IsString() @MaxLength(80) sort?: string;
  @IsOptional() @IsIn(['asc', 'desc']) order?: 'asc' | 'desc';
}

class ExportQuery {
  @IsOptional() @IsIn(['csv', 'json']) format?: 'csv' | 'json';
}

@Controller('database')
export class DatabaseController {
  constructor(private readonly db: DatabaseService) {}

  @Get('overview')
  overview() {
    return this.db.overview();
  }

  @Get('tables/:name')
  rows(@Param('name') name: string, @Query() qs: RowsQuery) {
    return this.db.rows(name, { page: qs.page ?? 1, pageSize: qs.pageSize ?? 25, q: qs.q, sort: qs.sort, order: qs.order ?? 'desc' });
  }

  @Get('tables/:name/rows/:id')
  row(@Param('name') name: string, @Param('id') id: string) {
    return this.db.row(name, id);
  }

  @Get('tables/:name/export')
  async export(@Param('name') name: string, @Query() qs: ExportQuery, @Res() res: Response) {
    const format = qs.format ?? 'csv';
    const out = await this.db.exportTable(name, format);
    res.setHeader('Content-Type', out.type);
    res.setHeader('Content-Disposition', `attachment; filename="${name}.${format}"`);
    res.send(out.body);
  }
}

@Module({ controllers: [DatabaseController], providers: [DatabaseService] })
export class DatabaseModule {}
