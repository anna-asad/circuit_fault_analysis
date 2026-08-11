"""
Supabase JWT Authentication Middleware for FastAPI
"""

import os
import jwt
from fastapi import Header, HTTPException
from typing import Optional
from dotenv import load_dotenv

load_dotenv()

SUPABASE_JWT_SECRET = os.getenv("SUPABASE_JWT_SECRET")

if not SUPABASE_JWT_SECRET:
    print("WARNING: SUPABASE_JWT_SECRET not set - auth will not work!")


def verify_token(authorization: Optional[str] = Header(None)) -> dict:
    """
    FastAPI dependency that verifies the Supabase JWT token.
    
    Usage:
        @app.get("/protected")
        async def protected_route(user: dict = Depends(verify_token)):
            user_id = user["sub"]  # Supabase user ID
            return {"user_id": user_id}
    
    Returns:
        dict: Decoded JWT payload containing user info
    
    Raises:
        HTTPException: If token is missing or invalid
    """
    if not authorization:
        raise HTTPException(
            status_code=401,
            detail="Missing authorization header"
        )
    
    if not authorization.startswith("Bearer "):
        raise HTTPException(
            status_code=401,
            detail="Invalid authorization header format. Use: Bearer <token>"
        )
    
    token = authorization.replace("Bearer ", "")
    
    try:
        # Verify and decode the JWT
        payload = jwt.decode(
            token,
            SUPABASE_JWT_SECRET,
            algorithms=["HS256"],
            audience="authenticated"
        )
        
        return payload
        
    except jwt.ExpiredSignatureError:
        raise HTTPException(
            status_code=401,
            detail="Token has expired"
        )
    except jwt.InvalidTokenError as e:
        raise HTTPException(
            status_code=401,
            detail=f"Invalid token: {str(e)}"
        )


def optional_verify_token(authorization: Optional[str] = Header(None)) -> Optional[dict]:
    """
    Optional auth dependency - returns None if no token provided, 
    but validates it if present.
    
    Useful for endpoints that work for both authenticated and non-authenticated users.
    """
    if not authorization:
        return None
    
    try:
        return verify_token(authorization)
    except HTTPException:
        return None
