"""create public_restrooms table

Revision ID: d1e2f3a4b5c6
Revises: c3a1f0d2b7e4
Create Date: 2026-11-19 16:00:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa

# revision identifiers, used by Alembic.
revision: str = 'd1e2f3a4b5c6'
down_revision: Union[str, Sequence[str], None] = 'c3a1f0d2b7e4'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        'public_restrooms',
        sa.Column('id', sa.Integer(), primary_key=True),
        sa.Column('source_id', sa.String(length=40), nullable=False, unique=True),
        sa.Column('name', sa.String(length=200), nullable=False),
        sa.Column('province', sa.String(length=50), nullable=True),
        sa.Column('district', sa.String(length=50), nullable=True),
        sa.Column('address', sa.Text(), nullable=True),
        sa.Column('address_en', sa.Text(), nullable=True),
        sa.Column('latitude', sa.Float(), nullable=False),
        sa.Column('longitude', sa.Float(), nullable=False),
        sa.Column('phone', sa.String(length=40), nullable=True),
        sa.Column('opening_hours', sa.String(length=200), nullable=True),
        sa.Column('managed_by', sa.String(length=200), nullable=True),
        sa.Column('accessible_toilets', sa.Integer(), nullable=False, server_default='0'),
        sa.Column('child_toilets', sa.Integer(), nullable=False, server_default='0'),
        sa.Column('has_nursing_room', sa.Boolean(), nullable=False, server_default='false'),
        sa.Column('data_updated', sa.String(length=8), nullable=True),
    )
    op.create_index('ix_public_restrooms_lat_lng', 'public_restrooms', ['latitude', 'longitude'])


def downgrade() -> None:
    op.drop_index('ix_public_restrooms_lat_lng', table_name='public_restrooms')
    op.drop_table('public_restrooms')
