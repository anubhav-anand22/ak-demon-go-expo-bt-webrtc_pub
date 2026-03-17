echo "✅ Removing"
rm -f ./manager
rm -f ./privileged
sudo rm -f /usr/local/bin/privileged
rm -f ./unprivileged
sudo rm -f /usr/local/bin/unprivileged

echo "✅ Compiling manager"
cd systemd-manager-go-ak-demon
go build -o ../manager .
cd ..

echo "✅ Compiling privileged"
cd privileged-go-ak-demon
go build -o ../privileged .
cd ..

echo "✅ Compiling unprivileged"
cd unprivileged-go-ak-demon
go build -o ../unprivileged .
cd ..

echo "✅ Moving privileged and unprivileged to /use/local/bin/"
sudo mv privileged /usr/local/bin/
sudo mv unprivileged /usr/local/bin/

echo "✅ Copying unprivileged frontend to $HOME/.ak-demon/unprivileged/pub"
sudo rm -rf $HOME/.ak-demon/unprivileged/pub
mkdir -p $HOME/.ak-demon/unprivileged/pub
cp -r ./unprivileged-go-ak-demon/pub $HOME/.ak-demon/unprivileged

echo "✅ making executable"
sudo chmod +x /usr/local/bin/privileged
sudo chmod +x /usr/local/bin/unprivileged

echo "✅ setting net privileges"
sudo setcap 'cap_net_raw,cap_net_admin=eip' /usr/local/bin/privileged