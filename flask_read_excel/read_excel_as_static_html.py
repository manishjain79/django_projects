import webbrowser
import pandas as pd

xls_filename = 'Financial_Sample.xlsx'
generate_template = './templates/index.html'

def generate_html(dataframe: pd.DataFrame):
    # get the table HTML from the dataframe
    tableid = 'table'
    table_html = dataframe.to_html(justify="center", table_id=tableid, header=True, classes=['fs-5', 'text-start', 'fst-italic'])
    # construct the complete HTML with jQuery Data tables
    # You can disable paging or enable y scrolling on lines 20 and 21 respectively
    html = f"""
    <html>
    <header>
        <link href="https://cdn.datatables.net/2.1.2/css/dataTables.dataTables.min.css" rel="stylesheet">

    </header>
    <body>
    {table_html}
    <script src="https://code.jquery.com/jquery-3.7.1.slim.js" integrity="sha256-UgvvN8vBkgO0luPSUl2s8TIlOSYRoGFAX4jlCIm9Adc=" crossorigin="anonymous"></script>
    <script type="text/javascript" src="https://cdn.datatables.net/2.1.2/js/dataTables.min.js"></script>

    <script>
        $(document).ready( function () {{
            $('#{tableid}').DataTable();
        }});
    </script>
    </body>
    </html>
    """
    # return the html
    return html


def write_html(generated_html, html_templatefile_output):
    with open(html_templatefile_output, "w") as html_template:
        html_template.write(generated_html)
    return html_templatefile_output

def open_html(htmlfile):
    webbrowser.open(htmlfile)

def get_data(filename):
    df = pd.read_excel(filename,sheet_name='Sheet1')
    df_enterprise = df[df['Segment'].isin(['Enterprise'])]
    df_channelpartner = df[df['Segment'].isin(['Channel Partners'])]
    df_midmarket = df[df['Segment'].isin(['Midmarket'])]
    df_government = df[df['Segment'].isin(['Government'])]
    df_smallbusiness = df[df['Segment'].isin(['Small Business'])]
    enterprisehtml = generate_html(df_enterprise)
    cphtml = generate_html(df_channelpartner)
    mmhtml = generate_html(df_midmarket)
    govhtml = generate_html(df_government)
    sbhtml = generate_html(df_smallbusiness)
    return (enterprisehtml, cphtml, mmhtml, govhtml, sbhtml)

if __name__ == "__main__":
    # df = pd.read_excel(xls_filename,sheet_name='Sheet1')
    # html = generate_html(df)
    # indexhtml = write_html(generated_html=html, html_templatefile_output='./templates/index.html')
    # open_html(indexhtml)
    (enterprisehtml, cphtml, mmhtml, govhtml, sbhtml) = get_data(filename=xls_filename)
    enterprisehtml_out = write_html(enterprisehtml, html_templatefile_output='./templates/enterprise.html')
    cphtml_out = write_html(cphtml, html_templatefile_output='./templates/channelpartner.html')
    mmhtml_out = write_html(mmhtml, html_templatefile_output='./templates/midmarket.html')
    govhtml_out = write_html(govhtml, html_templatefile_output='./templates/government.html')
    sbhtml_out = write_html(sbhtml, html_templatefile_output='./templates/smallbusiness.html')
    open_html(enterprisehtml_out)
    

