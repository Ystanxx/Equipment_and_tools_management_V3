from fastapi import HTTPException
from sqlalchemy.orm import lazyload

from app.models.borrow_order import BorrowOrder


def lock_borrow_order(db, order_id):
    # Lock the parent before reading any mutable child state, including cancellation.
    order = db.query(BorrowOrder).options(lazyload("*")).filter(
        BorrowOrder.id == order_id
    ).with_for_update(of=BorrowOrder).populate_existing().first()
    if not order:
        raise HTTPException(404, "借用单不存在")
    db.expire(order, ["approval_tasks", "items"])
    return order
