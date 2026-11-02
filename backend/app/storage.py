import boto3
from botocore.client import Config
from botocore.exceptions import ClientError

from . import config


def _client(endpoint: str):
    return boto3.client(
        "s3",
        endpoint_url=endpoint,
        aws_access_key_id=config.S3_ACCESS_KEY,
        aws_secret_access_key=config.S3_SECRET_KEY,
        region_name="us-east-1",
        config=Config(signature_version="s3v4", s3={"addressing_style": "path"}),
    )


s3 = _client(config.S3_ENDPOINT)
# Presigned URLs are signed against the host the browser will use.
s3_public = _client(config.S3_PUBLIC_ENDPOINT)


def ensure_bucket():
    try:
        s3.head_bucket(Bucket=config.S3_BUCKET)
    except ClientError:
        s3.create_bucket(Bucket=config.S3_BUCKET)


def upload_file(path: str, key: str, content_type: str | None = None):
    extra = {"ContentType": content_type} if content_type else None
    s3.upload_file(path, config.S3_BUCKET, key, ExtraArgs=extra)


def upload_fileobj(fileobj, key: str, content_type: str | None = None):
    extra = {"ContentType": content_type} if content_type else None
    s3.upload_fileobj(fileobj, config.S3_BUCKET, key, ExtraArgs=extra)


def download_file(key: str, path: str):
    s3.download_file(config.S3_BUCKET, key, path)


def delete_prefix(prefix: str):
    resp = s3.list_objects_v2(Bucket=config.S3_BUCKET, Prefix=prefix)
    for obj in resp.get("Contents", []):
        s3.delete_object(Bucket=config.S3_BUCKET, Key=obj["Key"])


def presign(key: str | None, expires: int = 3600) -> str | None:
    if not key:
        return None
    return s3_public.generate_presigned_url(
        "get_object", Params={"Bucket": config.S3_BUCKET, "Key": key}, ExpiresIn=expires
    )
