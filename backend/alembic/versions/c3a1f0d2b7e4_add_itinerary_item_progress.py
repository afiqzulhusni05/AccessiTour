"""add progress, transport, meal and accessibility check to itinerary items

Revision ID: c3a1f0d2b7e4
Revises: 89514954d32e
Create Date: 2026-10-26 21:00:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa

# revision identifiers, used by Alembic.
revision: str = 'c3a1f0d2b7e4'
down_revision: Union[str, Sequence[str], None] = '89514954d32e'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """Upgrade schema."""
    op.add_column('itinerary_items', sa.Column('progress', sa.String(length=20), server_default='UPCOMING', nullable=False))
    op.add_column('itinerary_items', sa.Column('transport', sa.String(length=20), nullable=True))
    op.add_column('itinerary_items', sa.Column('meal', sa.String(length=10), nullable=True))
    op.add_column('itinerary_items', sa.Column('needs_accessibility_check', sa.Boolean(), server_default='false', nullable=False))


def downgrade() -> None:
    """Downgrade schema."""
    op.drop_column('itinerary_items', 'needs_accessibility_check')
    op.drop_column('itinerary_items', 'meal')
    op.drop_column('itinerary_items', 'transport')
    op.drop_column('itinerary_items', 'progress')
