from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession
from typing import List, Dict, Any
import datetime

class CurrencyRepository:
    def __init__(self, db: AsyncSession):
        self.db = db

    def _row_to_dict(self, row) -> Dict[str, Any]:
        result = {}
        for column in row._mapping.keys():
            val = getattr(row, column)
            if isinstance(val, datetime.datetime):
                result[column[:1].lower() + column[1:]] = val.isoformat()
            elif isinstance(val, datetime.date):
                result[column[:1].lower() + column[1:]] = val.isoformat()
            elif isinstance(val, bytes):
                result[column[:1].lower() + column[1:]] = val != b'\x00'
            elif column == 'Rate' and val is not None:
                result[column[:1].lower() + column[1:]] = float(val)
            else:
                result[column[:1].lower() + column[1:]] = val
        return result

    # --- Currency operations ---
    async def get_all_currencies(self) -> List[Dict[str, Any]]:
        query = text("CALL SpCurrency('LIST', NULL, NULL, NULL, NULL, NULL, NULL)")
        result = await self.db.execute(query)
        return [self._row_to_dict(row) for row in result.fetchall()]

    async def get_currency(self, code: str) -> Dict[str, Any]:
        query = text("CALL SpCurrency('READ', :code, NULL, NULL, NULL, NULL, NULL)")
        result = await self.db.execute(query, {'code': code})
        row = result.fetchone()
        return self._row_to_dict(row) if row else None

    # --- ExchangeRate operations ---
    async def get_all_exchange_rates(self) -> List[Dict[str, Any]]:
        query = text("CALL SpExchangeRate('LIST', NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL)")
        result = await self.db.execute(query)
        return [self._row_to_dict(row) for row in result.fetchall()]

    async def get_exchange_rate(self, uid: str) -> Dict[str, Any]:
        query = text("CALL SpExchangeRate('READ', :uid, NULL, NULL, NULL, NULL, NULL, NULL, NULL)")
        result = await self.db.execute(query, {'uid': uid})
        row = result.fetchone()
        return self._row_to_dict(row) if row else None

    async def create_exchange_rate(self, uid: str, data: Dict[str, Any], current_user: str) -> Dict[str, Any]:
        query = text("""
            CALL SpExchangeRate(
                'CREATE', :uid, :fromCurrency, :toCurrency, :rateType, :rate,
                :effectiveDate, :source, :modifiedBy
            )
        """)
        params = {
            'uid': uid,
            'fromCurrency': data.get('fromCurrency'),
            'toCurrency': data.get('toCurrency'),
            'rateType': data.get('rateType'),
            'rate': data.get('rate'),
            'effectiveDate': data.get('effectiveDate'),
            'source': data.get('source'),
            'modifiedBy': current_user
        }
        result = await self.db.execute(query, params)
        row = result.fetchone()
        await self.db.commit()
        return self._row_to_dict(row) if row else None
