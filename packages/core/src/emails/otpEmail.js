export default function getOtpEmailHtml({ otp }) {
	return `<!doctype html>
<html>
  <body>
    <div
      style='background-color:#030712;color:#242424;font-family:"Helvetica Neue", "Arial Nova", "Nimbus Sans", Arial, sans-serif;font-size:16px;font-weight:400;letter-spacing:0.15008px;line-height:1.5;margin:0;padding:32px 0;min-height:100%;width:100%'
    >
      <table
        align="center"
        width="100%"
        style="margin:0 auto;max-width:600px;background-color:#030712"
        role="presentation"
        cellspacing="0"
        cellpadding="0"
        border="0"
      >
        <tbody>
          <tr style="width:100%">
            <td>
              <div style="padding:24px 24px 24px 24px">
                <a
                  href="https://gatekeepr.io"
                  style="text-decoration:none"
                  target="_blank"
                  ><img
                    alt="Gatekeepr"
                    src="https://gatekeepr.io/logo.png"
                    height="54"
                    style="height:54px;outline:none;border:none;text-decoration:none;vertical-align:middle;display:inline-block;max-width:100%"
                /></a>
              </div>
              <h1
                style="color:#FFFFFF;font-weight:bold;margin:0;font-size:32px;padding:16px 24px 16px 24px"
              >
                Hello,
              </h1>
              <div
                style="color:#FFFFFF;font-weight:normal;padding:0px 24px 16px 24px"
              >
                You can use the code below to verify your email address:
              </div>
              <h2
                style='color:#FFFFFF;font-weight:bold;margin:0;font-family:"Nimbus Mono PS", "Courier New", "Cutive Mono", monospace;font-size:24px;padding:16px 24px 16px 24px'
              >
                ${otp}
              </h2>
              <div
                style="color:#FFFFFF;font-weight:normal;padding:0px 24px 16px 24px"
              >
                This code will expire in 5 minutes for security reasons.
              </div>
              <div
                style="color:#A3A3A3;font-weight:normal;padding:16px 24px 16px 24px"
              >
                If you didn’t request this, you can safely ignore this email. No
                action will be taken.
              </div>
            </td>
          </tr>
        </tbody>
      </table>
    </div>
  </body>
</html>`
}