# import arrow
# import datetime
# import time
# dt = '2024-08-29T08:44:58.2164155Z'
# dt1 = dt.split('-')
# print(dt1)
# # print(help(arrow))

# # print(arrow.Arrow(dt))
# # arrow.get(dt)

# date_time = datetime.datetime(2024, 8, 29, 8, 44, 58)
# print(date_time)
# print(int(time.mktime(date_time.timetuple())))



import datetime
dt = '2024-08-29T08:44:58.2164155Z'
dt = dt.split('.')
print(datetime.datetime.fromisoformat(dt[0]).strftime('%s'))
## Create the instance
# today = date('2024-08-29T08:44:58.2164155Z')
# print("Date:", today)
# time_tuple = today.timetuple()
# # print time_tupe 
# print("\n date object's tuple:\n", time_tuple)
# # printing elements as tuple
# print("\nSpecific elements of this tuple can also be accessed: ")
# attributes = ['tm_year', 'tm_mon','tm_mday', 'tm_hour',
#                 'tm_min', 'tm_sec', 'tm_wday', 'tm_yday',
#                 'tm_isdst']
# i= 0
# for t in time_tuple:
#     print(attributes[i], "=",t)
#     i+=1