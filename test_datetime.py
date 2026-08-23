import datetime
import pytz
mytime = datetime.datetime(2024, 9, 21, 6, 18, 57, tzinfo=datetime.timezone.utc)
sgt = 'Asia/Singapore'
local = mytime.astimezone(pytz.timezone(sgt))
blobmtime = local.strftime("%d/%m/%Y-%H:%M:%S"))
